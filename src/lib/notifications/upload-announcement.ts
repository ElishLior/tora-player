/**
 * When the upload page announces what a session published. Pure and
 * client-safe.
 *
 * Each publish run adds the lessons it finished (new lessons and published
 * lessons it appended parts to) to one pending set. The set is announced once,
 * after a run, when no draft of the session is still uploading or failed, so a
 * failure followed by a successful retry still gives one complete summary.
 * While failures remain, the admin can send it now without the failed lessons.
 */

/** Run phases that block the announcement (see RunPhase in the upload page). */
const BUSY_PHASES = new Set(['queued', 'uploading']);

export type AnnounceDecision = 'nothing' | 'announce' | 'wait';

export function pendingAnnouncementDecision(pendingCount: number, runPhases: readonly string[]): AnnounceDecision {
  if (pendingCount === 0) return 'nothing';
  if (runPhases.some((phase) => BUSY_PHASES.has(phase) || phase === 'failed')) return 'wait';
  return 'announce';
}

/** "Send now": everything pending except lessons that still have a failed draft (they wait for the retry). */
export function splitPendingForSendNow(
  pending: Iterable<string>,
  failedLessonIds: Iterable<string>,
): { send: string[]; keep: string[] } {
  const failed = new Set(failedLessonIds);
  const send: string[] = [];
  const keep: string[] = [];
  for (const id of pending) (failed.has(id) ? keep : send).push(id);
  return { send, keep };
}
