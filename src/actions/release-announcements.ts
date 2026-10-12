'use server';

import { getSignedInClient } from '@/lib/account/server';
import { isAdmin } from '@/lib/auth/admin';
import {
  createReleasePushPort,
  createSupabaseReleaseStore,
  fetchLiveVersion,
  previewRelease,
  sendRelease,
  type ReleaseDeps,
  type ReleasePreview,
  type ReleaseSendReason,
  type ReleaseSendResult,
} from '@/lib/notifications/release-announcement';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { isMissingReleaseSchema, validateReleaseText, type ReleaseField } from '@/lib/release-announcement';

/**
 * Admin actions for manual release announcements. Only sendReleaseAnnouncement
 * sends anything, and it sends only when an admin passes the version they saw
 * on screen. Saving a draft and previewing never reach the push channel.
 */

export type ReleaseActionError =
  | 'unauthorized'
  | 'schema_missing'
  | 'invalid'
  | 'not-found'
  | 'not-draft'
  | 'load-failed'
  | ReleaseSendReason;

export type ReleaseActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: ReleaseActionError; fields?: ReleaseField[] };

function productionDeps(): ReleaseDeps {
  const supabase = createAdminSupabaseClient();
  return {
    store: createSupabaseReleaseStore(supabase),
    push: createReleasePushPort(supabase),
    liveVersion: () => fetchLiveVersion(),
  };
}

function failureOf(err: unknown): ReleaseActionError {
  return isMissingReleaseSchema(err as { code?: string }) ? 'schema_missing' : 'load-failed';
}

/** Creates a draft (id = null) or edits one. Drafts only: a sending or sent row is never changed. */
export async function saveReleaseDraft(
  id: string | null,
  input: Partial<Record<ReleaseField, unknown>>,
): Promise<ReleaseActionResult<{ id: string }>> {
  if (!(await isAdmin())) return { ok: false, error: 'unauthorized' };
  const validation = validateReleaseText(input);
  if (!validation.ok) return { ok: false, error: 'invalid', fields: validation.fields };

  try {
    const store = createSupabaseReleaseStore(createAdminSupabaseClient());
    if (id) {
      const updated = await store.updateDraft(id, validation.value);
      return updated ? { ok: true, id } : { ok: false, error: 'not-draft' };
    }
    const session = await getSignedInClient();
    return { ok: true, id: await store.insertDraft(validation.value, session?.userId ?? null) };
  } catch (err) {
    return { ok: false, error: failureOf(err) };
  }
}

/** What the admin confirms: the row, the audience, the live version and any block. Sends nothing. */
export async function previewReleaseAnnouncement(
  id: string,
): Promise<ReleaseActionResult<{ preview: ReleasePreview & { found: true } }>> {
  if (!(await isAdmin())) return { ok: false, error: 'unauthorized' };
  try {
    const preview = await previewRelease(id, productionDeps());
    if (!preview.found) return { ok: false, error: 'not-found' };
    return { ok: true, preview };
  } catch (err) {
    return { ok: false, error: failureOf(err) };
  }
}

/**
 * The one place a release is pushed. `confirmVersion` must equal the stored
 * version, so a stale screen cannot send a different release.
 */
export async function sendReleaseAnnouncement(
  id: string,
  confirmVersion: string,
): Promise<ReleaseActionResult<{ result: ReleaseSendResult }>> {
  if (!(await isAdmin())) return { ok: false, error: 'unauthorized' };
  try {
    const result = await sendRelease(id, confirmVersion, productionDeps());
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: failureOf(err) };
  }
}
