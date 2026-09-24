const PLACEHOLDER_ORIGIN = 'http://placeholder.invalid';

/**
 * Returns `next` only when it is a same-origin path (e.g. `/he/lessons?x=1`);
 * anything that would leave the site (`//evil.com`, `/\evil.com`, absolute
 * URLs, control characters the URL parser strips) falls back.
 */
export function safeRedirectPath(next: string | null | undefined, fallback: string): string {
  if (!next || !next.startsWith('/')) return fallback;
  try {
    const url = new URL(next, PLACEHOLDER_ORIGIN);
    if (url.origin !== PLACEHOLDER_ORIGIN) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
