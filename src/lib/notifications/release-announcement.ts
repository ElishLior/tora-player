import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { absoluteUrl } from '@/config/site';
import { parseVersionResponse } from '@/lib/app-update';
import { getVapidDetails, loadAllPushSubscriptions, sendPush } from '@/lib/notifications/push';
import {
  releasePushPayload,
  releaseSendBlock,
  type ReleaseAnnouncementRow,
  type ReleasePushPayload,
  type ReleaseSendBlock,
  type ReleaseText,
} from '@/lib/release-announcement';

/**
 * Manual release announcements through the existing Web Push channel. Nothing
 * here runs on its own: a send happens only when an admin's explicit action
 * calls sendRelease(). Lesson-upload summaries (notify.ts) never touch this.
 *
 * The orchestration takes its three ports as arguments, so the rules (claim
 * once, live-version gate, confirm the version) are tested with fakes. The
 * production ports are at the bottom of this file.
 */

export interface ReleaseStore {
  list(): Promise<ReleaseAnnouncementRow[]>;
  find(id: string): Promise<ReleaseAnnouncementRow | null>;
  insertDraft(text: ReleaseText, createdBy: string | null): Promise<string>;
  /** Edits a draft only. False when the row is no longer a draft (or does not exist). */
  updateDraft(id: string, text: ReleaseText): Promise<boolean>;
  /**
   * Atomically moves a draft to 'sending'. True for exactly one caller; false
   * when the row was already claimed, or another row for this version is sending or sent.
   */
  claimDraft(id: string): Promise<boolean>;
  finish(id: string, outcome: { status: 'sent' | 'failed'; sentCount: number; failedCount: number }): Promise<void>;
}

export interface ReleasePush {
  pushConfigured(): boolean;
  /** Every push subscription: the same audience the lesson push uses (no separate push preference exists). */
  countSubscriptions(): Promise<number>;
  send(payload: ReleasePushPayload): Promise<{ sent: number; failed: number; expired: number }>;
}

export interface ReleaseDeps {
  store: ReleaseStore;
  push: ReleasePush;
  /** The version the live site serves (never throws; null when unknown). */
  liveVersion: () => Promise<string | null>;
}

export type ReleaseSendReason = 'not-found' | 'not-confirmed' | ReleaseSendBlock | 'already-claimed' | 'send-failed';

export type ReleaseSendResult =
  | { ok: true; sent: number; failed: number; expired: number }
  | { ok: false; reason: ReleaseSendReason };

export type ReleasePreview =
  | { found: false }
  | {
      found: true;
      row: ReleaseAnnouncementRow;
      audience: number;
      liveVersion: string | null;
      block: ReleaseSendBlock | null;
    };

/** What an admin sees before confirming: the row, how many devices, the live version and any block. Sends nothing. */
export async function previewRelease(id: string, deps: ReleaseDeps): Promise<ReleasePreview> {
  const row = await deps.store.find(id);
  if (!row) return { found: false };
  const [audience, liveVersion] = await Promise.all([deps.push.countSubscriptions(), deps.liveVersion()]);
  const block = releaseSendBlock({
    status: row.status,
    pushConfigured: deps.push.pushConfigured(),
    liveVersion,
    version: row.version,
  });
  return { found: true, row, audience, liveVersion, block };
}

/**
 * Sends one release, once. `confirmVersion` must be the version the admin saw
 * (a stale page cannot send a different release). Order: find, confirm, live
 * gate (before any claim), atomic claim, send, record. A claimed row ends as
 * 'sent' or 'failed' and is never sent again.
 */
export async function sendRelease(id: string, confirmVersion: string, deps: ReleaseDeps): Promise<ReleaseSendResult> {
  const row = await deps.store.find(id);
  if (!row) return { ok: false, reason: 'not-found' };
  if (confirmVersion !== row.version) return { ok: false, reason: 'not-confirmed' };

  const block = releaseSendBlock({
    status: row.status,
    pushConfigured: deps.push.pushConfigured(),
    liveVersion: await deps.liveVersion(),
    version: row.version,
  });
  if (block) return { ok: false, reason: block };

  if (!(await deps.store.claimDraft(id))) return { ok: false, reason: 'already-claimed' };

  let result: { sent: number; failed: number; expired: number };
  try {
    result = await deps.push.send(releasePushPayload(row));
  } catch (err) {
    console.error('[release] push send failed; the announcement is closed as failed:', id, err);
    await deps.store.finish(id, { status: 'failed', sentCount: 0, failedCount: 0 }).catch((finishErr) => {
      console.error('[release] could not mark the announcement failed:', id, finishErr);
    });
    return { ok: false, reason: 'send-failed' };
  }

  try {
    await deps.store.finish(id, { status: 'sent', sentCount: result.sent, failedCount: result.failed });
  } catch (err) {
    // The push already went out. The row stays 'sending', which blocks a second send of this version.
    console.error('[release] sent but the record could not be saved; check the row by hand:', id, err);
  }
  return { ok: true, ...result };
}

/** GET /api/version on the live site; null on any failure (the send is then blocked). */
export async function fetchLiveVersion(fetcher: typeof fetch = fetch): Promise<string | null> {
  try {
    const response = await fetcher(absoluteUrl('/api/version'), {
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    return parseVersionResponse(await response.json())?.version ?? null;
  } catch {
    return null;
  }
}

const RELEASE_COLUMNS =
  'id, version, title_he, body_he, title_en, body_en, status, created_at, sent_at, sent_count, failed_count';

/** A database row (snake_case columns) as the app's row type. */
interface ReleaseRecord {
  id: string;
  version: string;
  title_he: string;
  body_he: string;
  title_en: string;
  body_en: string;
  status: ReleaseAnnouncementRow['status'];
  created_at: string;
  sent_at: string | null;
  sent_count: number;
  failed_count: number;
}

function toRow(record: ReleaseRecord): ReleaseAnnouncementRow {
  return {
    id: record.id,
    version: record.version,
    titleHe: record.title_he,
    bodyHe: record.body_he,
    titleEn: record.title_en,
    bodyEn: record.body_en,
    status: record.status,
    createdAt: record.created_at,
    sentAt: record.sent_at,
    sentCount: record.sent_count,
    failedCount: record.failed_count,
  };
}

/** Production store over the service-role client (the table has RLS with no policies). */
export function createSupabaseReleaseStore(supabase: SupabaseClient): ReleaseStore {
  return {
    async list() {
      const { data, error } = await supabase
        .from('release_announcements')
        .select(RELEASE_COLUMNS)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return ((data ?? []) as ReleaseRecord[]).map(toRow);
    },
    async find(id) {
      const { data, error } = await supabase
        .from('release_announcements')
        .select(RELEASE_COLUMNS)
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data ? toRow(data as ReleaseRecord) : null;
    },
    async insertDraft(text, createdBy) {
      const { data, error } = await supabase
        .from('release_announcements')
        .insert({
          version: text.version,
          title_he: text.titleHe,
          body_he: text.bodyHe,
          title_en: text.titleEn,
          body_en: text.bodyEn,
          created_by: createdBy,
        })
        .select('id')
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    async updateDraft(id, text) {
      const { data, error } = await supabase
        .from('release_announcements')
        .update({
          version: text.version,
          title_he: text.titleHe,
          body_he: text.bodyHe,
          title_en: text.titleEn,
          body_en: text.bodyEn,
        })
        .eq('id', id)
        .eq('status', 'draft')
        .select('id');
      if (error) throw error;
      return (data ?? []).length === 1;
    },
    async claimDraft(id) {
      const { data, error } = await supabase
        .from('release_announcements')
        .update({ status: 'sending' })
        .eq('id', id)
        .eq('status', 'draft')
        .select('id');
      // 23505: another row for this version is already sending or sent (unique index, migration 025).
      if (error?.code === '23505') return false;
      if (error) throw error;
      return (data ?? []).length === 1;
    },
    async finish(id, outcome) {
      const { error } = await supabase
        .from('release_announcements')
        .update({
          status: outcome.status,
          sent_at: new Date().toISOString(),
          sent_count: outcome.sentCount,
          failed_count: outcome.failedCount,
        })
        .eq('id', id);
      if (error) throw error;
    },
  };
}

/** Production push port: the existing subscriptions and sendPush, at normal urgency (a release can wait a little). */
export function createReleasePushPort(supabase: SupabaseClient): ReleasePush {
  return {
    pushConfigured: () => getVapidDetails() !== null,
    async countSubscriptions() {
      const { count, error } = await supabase.from('push_subscriptions').select('id', { count: 'exact', head: true });
      if (error) throw error;
      return count ?? 0;
    },
    async send(payload) {
      const subscriptions = await loadAllPushSubscriptions();
      const result = await sendPush(subscriptions, payload, { urgency: 'normal' });
      return { sent: result.sent, failed: result.failed, expired: result.expired };
    },
  };
}
