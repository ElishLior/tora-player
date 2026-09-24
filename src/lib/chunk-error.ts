/**
 * A deploy replaces the hashed JS/CSS chunks. A tab still running the previous
 * build fails to load the chunks it has not cached yet (public/sw.js keeps the
 * ones it has), and the route error boundary reloads once to pick up the new
 * build.
 */

// Webpack (ChunkLoadError / "Loading chunk 12 failed", "Loading CSS chunk"),
// Chrome, Safari and Firefox dynamic import() failures.
const CHUNK_ERROR_PATTERN =
  /Loading (?:CSS )?chunk [^ ]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

export function isChunkLoadError(error: { name?: string; message?: string }): boolean {
  return error.name === 'ChunkLoadError' || CHUNK_ERROR_PATTERN.test(error.message ?? '');
}

export const CHUNK_RELOAD_KEY = 'tora-chunk-reload-at';
// A second automatic reload this soon means the reload did not help (a loop):
// show the error screen instead.
const RELOAD_GUARD_MS = 60_000;

/**
 * Records an automatic reload in `storage` (sessionStorage) and returns true
 * when one may happen now: never twice within RELOAD_GUARD_MS, but again for a
 * later deploy in the same long-lived tab.
 */
export function claimChunkReload(storage: Pick<Storage, 'getItem' | 'setItem'>, now = Date.now()): boolean {
  const last = Number(storage.getItem(CHUNK_RELOAD_KEY));
  if (last && now - last < RELOAD_GUARD_MS) return false;
  storage.setItem(CHUNK_RELOAD_KEY, String(now));
  return true;
}
