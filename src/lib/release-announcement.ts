import { localePath } from '@/config/site';

/**
 * Manual release announcements (Web Push only). Pure rules: the template, input
 * validation, the push payload, the reason a send is blocked, and which database
 * errors mean the table is missing. The orchestration lives in
 * src/lib/notifications/release-announcement.ts.
 */

export const RELEASE_STATUSES = ['draft', 'sending', 'sent', 'failed'] as const;
export type ReleaseStatus = (typeof RELEASE_STATUSES)[number];

export interface ReleaseText {
  version: string;
  titleHe: string;
  bodyHe: string;
  titleEn: string;
  bodyEn: string;
}

export interface ReleaseAnnouncementRow extends ReleaseText {
  id: string;
  status: ReleaseStatus;
  createdAt: string;
  sentAt: string | null;
  sentCount: number;
  failedCount: number;
}

export const RELEASE_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
export const RELEASE_TITLE_MAX = 100;
export const RELEASE_BODY_MAX = 300;

export type ReleaseField = keyof ReleaseText;

/** The owner-approved template. The title names the major.minor release ("נגן תורה 1.2 זמין"). */
export function releaseTemplate(version: string): ReleaseText {
  const release = version.split('.').slice(0, 2).join('.');
  return {
    version,
    titleHe: `נגן תורה ${release} זמין`,
    bodyHe: 'עדכון חדש מוכן. רעננו את האתר או השתמשו בכפתור הרענון באפליקציה כדי לטעון את הגרסה האחרונה.',
    titleEn: `Torah Player ${release} is available`,
    bodyEn: "A new update is ready. Refresh the website or use the app's refresh action to load the latest version.",
  };
}

export type ReleaseValidation = { ok: true; value: ReleaseText } | { ok: false; fields: ReleaseField[] };

/** Trims every field and reports the ones that are empty, too long or not a version. */
export function validateReleaseText(input: Partial<Record<ReleaseField, unknown>>): ReleaseValidation {
  const value = {
    version: String(input.version ?? '').trim(),
    titleHe: String(input.titleHe ?? '').trim(),
    bodyHe: String(input.bodyHe ?? '').trim(),
    titleEn: String(input.titleEn ?? '').trim(),
    bodyEn: String(input.bodyEn ?? '').trim(),
  };
  const fields: ReleaseField[] = [];
  if (!RELEASE_VERSION_PATTERN.test(value.version)) fields.push('version');
  for (const field of ['titleHe', 'titleEn'] as const) {
    if (!value[field] || value[field].length > RELEASE_TITLE_MAX) fields.push(field);
  }
  for (const field of ['bodyHe', 'bodyEn'] as const) {
    if (!value[field] || value[field].length > RELEASE_BODY_MAX) fields.push(field);
  }
  return fields.length > 0 ? { ok: false, fields } : { ok: true, value };
}

/** The same-origin path a release notification opens: the home page with the update request. */
export function releaseClickPath(): string {
  return `${localePath('/')}?update=1`;
}

export interface ReleasePushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
  actions: Array<{ action: 'refresh' | 'later'; title: string }>;
}

/** The Hebrew push (subscriptions carry no locale; the service worker shows it RTL). */
export function releasePushPayload(text: Pick<ReleaseText, 'version' | 'titleHe' | 'bodyHe'>): ReleasePushPayload {
  return {
    title: text.titleHe,
    body: text.bodyHe,
    url: releaseClickPath(),
    tag: `release-${text.version}`,
    actions: [
      { action: 'refresh', title: 'רענון' },
      { action: 'later', title: 'אחר כך' },
    ],
  };
}

export type ReleaseSendBlock = 'not-draft' | 'not-configured' | 'live-unknown' | 'live-mismatch';

/**
 * Why a release cannot be sent now, or null when it can. The live version must
 * equal the announced one: the announcement may only describe a build people
 * can already load.
 */
export function releaseSendBlock({
  status,
  pushConfigured,
  liveVersion,
  version,
}: {
  status: ReleaseStatus;
  pushConfigured: boolean;
  liveVersion: string | null;
  version: string;
}): ReleaseSendBlock | null {
  if (status !== 'draft') return 'not-draft';
  if (!pushConfigured) return 'not-configured';
  if (liveVersion === null) return 'live-unknown';
  if (liveVersion !== version) return 'live-mismatch';
  return null;
}

/**
 * Error codes meaning "the release table is not there yet" (migration 025 not
 * applied): undefined table / column / function, and PostgREST's schema-cache
 * misses. The app then disables sending instead of failing.
 */
const MISSING_SCHEMA_CODES = ['42P01', '42703', '42883', 'PGRST202', 'PGRST204', 'PGRST205'];

export function isMissingReleaseSchema(error: { code?: string } | null | undefined): boolean {
  return !!error && MISSING_SCHEMA_CODES.includes(error.code ?? '');
}
