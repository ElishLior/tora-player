import type { QueueNotice } from '@/lib/queue-source';

/** A category queue outcome a player surface shows inline, with the values its message takes. */
export type PlayerQueueNotice = { key: 'stopped' | 'finished' } | { key: 'skipped'; title: string };

/**
 * The category queue outcomes the listener should see from any player surface
 * (mini player, desktop bar, not only the category page). `loading` is not one
 * of them: the transport spinner already shows the wait.
 */
export function playerQueueNotice(notice: QueueNotice | null): PlayerQueueNotice | null {
  if (!notice || notice.kind === 'loading') return null;
  if (notice.kind === 'skipped') return { key: 'skipped', title: notice.title };
  return { key: notice.kind };
}
