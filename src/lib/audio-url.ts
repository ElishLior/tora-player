/**
 * Normalize audio URLs to use the stream proxy instead of direct R2 URLs.
 *
 * Direct R2 URLs require authentication and return 400/403 from the browser.
 * Old lessons may have these URLs stored in the database from before the
 * upload flow was changed to use the stream proxy.
 *
 * This converts direct R2 URLs to our /api/audio/stream/ proxy which
 * generates signed download URLs on-the-fly.
 */
export function normalizeAudioUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  // Already using our stream proxy — no change needed
  if (url.startsWith('/api/audio/stream/')) return url;

  // Direct R2 storage URL: https://<account>.r2.cloudflarestorage.com/<bucket>/<key>
  const r2Match = url.match(
    /https?:\/\/[^/]*\.r2\.cloudflarestorage\.com\/[^/]+\/(.+?)(?:\?.*)?$/
  );
  if (r2Match) {
    const fileKey = decodeURIComponent(r2Match[1]);
    return `/api/audio/stream/${encodeURIComponent(fileKey)}`;
  }

  // R2 dev URL: https://<id>.r2.dev/<key>
  const r2DevMatch = url.match(/https?:\/\/[^/]*\.r2\.dev\/(.+?)(?:\?.*)?$/);
  if (r2DevMatch) {
    const fileKey = decodeURIComponent(r2DevMatch[1]);
    return `/api/audio/stream/${encodeURIComponent(fileKey)}`;
  }

  // Not an R2 URL — return as-is
  return url;
}
