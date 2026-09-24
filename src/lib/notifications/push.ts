import 'server-only';
import webpush from 'web-push';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { summarizePushOutcomes, type PushOutcome } from '@/lib/notifications/push-results';

export interface PushPayload {
  title: string;
  body: string;
  /** Same-origin path opened when the notification is tapped. */
  url: string;
  /** Notifications with the same tag replace each other. */
  tag?: string;
}

export interface StoredPushSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

const SEND_CONCURRENCY = 25;
const PAGE_SIZE = 1000;
const TTL_SECONDS = 24 * 60 * 60;

export function getVapidDetails(env: Partial<Record<string, string | undefined>> = process.env) {
  const publicKey = env.VAPID_PUBLIC_KEY || env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  const subject = env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

export async function loadAllPushSubscriptions(): Promise<StoredPushSubscription[]> {
  const supabase = createAdminSupabaseClient();
  const all: StoredPushSubscription[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .order('created_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    all.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return all;
  }
}

/**
 * Sends `payload` to every subscription, deletes subscriptions the push
 * service reports as gone (404/410) and stamps last_success_at on delivered
 * ones. Never throws; returns delivery counts.
 */
export async function sendPush(
  subscriptions: StoredPushSubscription[],
  payload: PushPayload,
): Promise<{ sent: number; expired: number; failed: number }> {
  const vapidDetails = getVapidDetails();
  if (!vapidDetails) {
    console.warn('[push] VAPID keys are not configured; skipping push.');
    return { sent: 0, expired: 0, failed: subscriptions.length };
  }

  const body = JSON.stringify(payload);
  const outcomes: PushOutcome[] = [];
  for (let i = 0; i < subscriptions.length; i += SEND_CONCURRENCY) {
    const batch = subscriptions.slice(i, i + SEND_CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map((subscription) =>
        webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          body,
          { vapidDetails, TTL: TTL_SECONDS, urgency: 'normal' },
        ),
      ),
    );
    settled.forEach((result, index) => {
      const id = batch[index].id;
      if (result.status === 'fulfilled') {
        outcomes.push({ id, ok: true });
      } else {
        const statusCode = (result.reason as { statusCode?: number } | undefined)?.statusCode;
        outcomes.push({ id, ok: false, statusCode });
      }
    });
  }

  const { sentIds, expiredIds, failedIds } = summarizePushOutcomes(outcomes);
  const supabase = createAdminSupabaseClient();
  try {
    for (let i = 0; i < expiredIds.length; i += 100) {
      const { error } = await supabase.from('push_subscriptions').delete().in('id', expiredIds.slice(i, i + 100));
      if (error) throw new Error(error.message);
    }
    const now = new Date().toISOString();
    for (let i = 0; i < sentIds.length; i += 100) {
      const { error } = await supabase
        .from('push_subscriptions')
        .update({ last_success_at: now })
        .in('id', sentIds.slice(i, i + 100));
      if (error) throw new Error(error.message);
    }
  } catch (err) {
    console.error('[push] subscription bookkeeping failed:', err);
  }

  if (failedIds.length > 0) {
    console.warn(`[push] ${failedIds.length} deliveries failed (kept for retry).`);
  }
  return { sent: sentIds.length, expired: expiredIds.length, failed: failedIds.length };
}
