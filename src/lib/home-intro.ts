/*
 * Whether the home page's feature intro starts open. Pure: the component reads
 * and writes localStorage and passes the stored value in.
 *
 * First visit (nothing stored): open, and remembered as "seen" so later visits
 * start collapsed. After that the listener's own choice ("open" / "closed") wins.
 */

export const HOME_INTRO_STORAGE_KEY = 'tora-player-home-intro';

export interface HomeIntroStart {
  open: boolean;
  /** A value to store right away, or null to leave storage as it is. */
  write: string | null;
}

export function homeIntroStart(stored: string | null): HomeIntroStart {
  if (stored === null) return { open: true, write: 'seen' };
  return { open: stored === 'open', write: null };
}

export function homeIntroChoice(open: boolean): string {
  return open ? 'open' : 'closed';
}
