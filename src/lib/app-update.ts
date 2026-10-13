/**
 * Update detection and the safe refresh, as pure decisions. The hook
 * (src/hooks/use-app-update.ts) only reads the browser and calls these.
 *
 * Rules in one place:
 * - Checks run on load, when the tab becomes visible, when the device comes
 *   back online, and on a 30-minute timer. Failures back off (silently).
 * - A build is "available" when the server (or a waiting service worker)
 *   reports a different build id than the one running. "Later" snoozes that
 *   build id only; the next deploy shows the banner again.
 * - Refresh is never automatic while audio plays: it waits for a pause and
 *   then needs the user's tap. A refresh writes a short record first; after
 *   the reload the running build must match it, otherwise the build is
 *   snoozed and the recovery message is shown. Nothing reloads twice.
 */

export const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
/** Back-to-online checks come at most once a minute, however often the network flaps. */
export const UPDATE_MIN_GAP_MS = 60 * 1000;
/** Consecutive failures wait longer and longer, up to this. */
export const UPDATE_MAX_BACKOFF_MS = 4 * 60 * 60 * 1000;
export const UPDATE_RELOAD_KEY = 'tora-app-update-reload';
export const UPDATE_SNOOZE_KEY = 'tora-app-update-snoozed';
/** A refresh record older than this no longer counts (the reload would have happened by now). */
export const UPDATE_RELOAD_TTL_MS = 10 * 60 * 1000;
/** Query parameter a push notification uses to ask for the refresh flow. */
export const UPDATE_REQUEST_PARAM = 'update';

export type UpdateTrigger = 'load' | 'visible' | 'online' | 'interval';

interface CheckInput {
  trigger: UpdateTrigger;
  now: number;
  /** Time of the last check attempt, or null before the first one. */
  lastAttemptAt: number | null;
  /** Consecutive failed checks. */
  failures: number;
}

/** Whether a check may run now. Pure. */
export function shouldCheckForUpdate({ trigger, now, lastAttemptAt, failures }: CheckInput): boolean {
  if (lastAttemptAt === null) return true;
  const elapsed = now - lastAttemptAt;
  if (trigger === 'online') return elapsed >= UPDATE_MIN_GAP_MS;
  const gap =
    failures > 0 ? Math.min(UPDATE_CHECK_INTERVAL_MS * 2 ** failures, UPDATE_MAX_BACKOFF_MS) : UPDATE_CHECK_INTERVAL_MS;
  return elapsed >= gap;
}

/** A usable build id: non-empty and not the local-development fallback. */
export function isDeployedBuildId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value !== 'dev';
}

/** The `v` parameter of a service worker script URL (`/sw.js?v=<build id>`). */
export function buildIdFromScriptUrl(scriptUrl: string | undefined | null): string | null {
  if (!scriptUrl) return null;
  try {
    const id = new URL(scriptUrl, 'http://localhost').searchParams.get('v');
    return isDeployedBuildId(id) ? id : null;
  } catch {
    return null;
  }
}

/** The body of GET /api/version, or null when it is not that shape. */
export function parseVersionResponse(json: unknown): { version: string; buildId: string } | null {
  if (!json || typeof json !== 'object') return null;
  const { version, buildId } = json as Record<string, unknown>;
  if (typeof version !== 'string' || !isDeployedBuildId(buildId)) return null;
  return { version, buildId };
}

interface TargetInput {
  runningBuildId: string;
  /** From GET /api/version. */
  serverBuildId: string | null;
  /** From the service worker registration, if a newer worker is waiting. */
  waitingBuildId: string | null;
  snoozedBuildId: string | null;
}

/**
 * The build to offer, or null. The server's answer wins over a waiting
 * worker. A running build that is not a deployed id (local dev) offers nothing.
 */
export function updateTarget({
  runningBuildId,
  serverBuildId,
  waitingBuildId,
  snoozedBuildId,
}: TargetInput): string | null {
  if (!isDeployedBuildId(runningBuildId)) return null;
  const target = [serverBuildId, waitingBuildId].find(
    (id): id is string => isDeployedBuildId(id) && id !== runningBuildId,
  );
  if (!target || target === snoozedBuildId) return null;
  return target;
}

export type RefreshDecision = 'none' | 'wait-for-pause' | 'refresh';

/**
 * What a refresh may do now. Audio playing (or loading) defers it: the banner
 * says so, and the user taps again after the pause. Never a reload mid-track.
 */
export function refreshDecision({ target, playing }: { target: string | null; playing: boolean }): RefreshDecision {
  if (!target) return 'none';
  return playing ? 'wait-for-pause' : 'refresh';
}

export interface RefreshRecord {
  /** The build the user was offered. */
  target: string;
  /** The build the tab was running when it asked for the refresh. */
  from: string;
  at: number;
}

export function refreshRecord(target: string, from: string, now: number): string {
  const record: RefreshRecord = { target, from, at: now };
  return JSON.stringify(record);
}

export function parseRefreshRecord(raw: string | null): RefreshRecord | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<RefreshRecord>;
    return isDeployedBuildId(value.target) && isDeployedBuildId(value.from) && typeof value.at === 'number'
      ? { target: value.target, from: value.from, at: value.at }
      : null;
  } catch {
    return null;
  }
}

/**
 * After a page load, did the refresh we started move the tab forward?
 * - 'none': no refresh record (or it expired): nothing to report.
 * - 'verified': the page now runs a build other than the one it left. That is
 *   the target, or a newer one shipped in the meantime (a hotfix): both are fine.
 * - 'mismatch': the reload came back on the same build it left. Show recovery
 *   and do not retry: the build is snoozed, nothing reloads by itself.
 */
export function verifyRefresh({
  raw,
  runningBuildId,
  now,
}: {
  raw: string | null;
  runningBuildId: string;
  now: number;
}): 'none' | 'verified' | 'mismatch' {
  const record = parseRefreshRecord(raw);
  if (!record || now - record.at > UPDATE_RELOAD_TTL_MS || now < record.at) return 'none';
  return runningBuildId === record.from ? 'mismatch' : 'verified';
}

/** True when the URL asks for the refresh flow (`?update=1`, from a push notification). */
export function isUpdateRequested(search: string): boolean {
  return new URLSearchParams(search).get(UPDATE_REQUEST_PARAM) === '1';
}

/** The URL without the update request, other parameters and the hash kept. */
export function withoutUpdateRequest(href: string): string {
  const url = new URL(href);
  url.searchParams.delete(UPDATE_REQUEST_PARAM);
  return url.toString();
}

/** One bounded, uncached GET /api/version. Null on any failure or timeout (never throws). */
export async function fetchDeployedVersion(
  fetcher: typeof fetch,
  timeoutMs: number,
): Promise<{ version: string; buildId: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher('/api/version', { cache: 'no-store', signal: controller.signal });
    if (!response.ok) return null;
    return parseVersionResponse(await response.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
