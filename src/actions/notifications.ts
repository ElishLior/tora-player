'use server';

import { getTranslations } from 'next-intl/server';
import { isAdmin } from '@/lib/auth/admin';
import { getVapidDetails, sendPush } from '@/lib/notifications/push';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

export type TestNotificationResult =
  | { ok: true }
  | { ok: false; error: 'unauthorized' | 'not_configured' | 'not_subscribed' | 'failed' };

/** Admin only: sends a test push to the calling device's subscription. */
export async function sendTestNotification(endpoint: string): Promise<TestNotificationResult> {
  if (!(await isAdmin())) return { ok: false, error: 'unauthorized' };
  if (!getVapidDetails()) return { ok: false, error: 'not_configured' };
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return { ok: false, error: 'not_subscribed' };

  const { data: subscription } = await createAdminSupabaseClient()
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('endpoint', endpoint)
    .maybeSingle();
  if (!subscription) return { ok: false, error: 'not_subscribed' };

  const t = await getTranslations('notifications.push');
  const result = await sendPush([subscription], {
    title: t('testTitle'),
    body: t('testBody'),
    url: '/he',
    tag: 'test',
  });
  return result.sent === 1 ? { ok: true } : { ok: false, error: 'failed' };
}
