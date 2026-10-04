/*
 * Which length of an audio part to believe.
 *
 * Two sources can each be wrong, in either direction: the catalog length (read
 * once in the admin's browser at upload, or imported; 0 when unknown) and the
 * element length (a browser estimate that can be minutes off for streamed
 * Opus and later revised). There is no way to tell which one is right while
 * the file plays, so every decision that is costly to get wrong early takes
 * the longer known value:
 * - "heard" by position (a wrong early "heard" resets the resume point), and
 * - the length shown on every surface and sent to the lock screen (a short
 *   value reads "finished" while audio remains).
 * Waiting too long costs little: a natural `ended` always marks the part done,
 * and the player never shows a length below the position it has reached.
 */

function usable(seconds: number): number {
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

export function trustedPartDuration({ catalog, element }: { catalog: number; element: number }): number {
  const listed = usable(catalog);
  const observed = usable(element);
  if (listed === 0) return observed;
  if (observed === 0) return listed;
  return Math.max(listed, observed);
}
