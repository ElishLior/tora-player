/**
 * Which R2 keys the public lesson-image route (`/api/images/stream/…`) may
 * sign, and how it signs them. Dependency-free so the route never loads sharp.
 */

/** Formats the image route serves; never SVG/HTML, which could carry script. */
const IMAGE_CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
};

/**
 * Content type for a key the public image route may sign, or null. Only
 * lesson gallery objects (`images/…`, originals and thumbnails) with a raster
 * extension qualify: never audio, chunks, private note images or traversal.
 */
export function servableImageContentType(key: string): string | null {
  if (!key.startsWith('images/') || key.includes('..') || key.includes('\\')) return null;
  const extension = key.slice(key.lastIndexOf('.') + 1).toLowerCase();
  return Object.hasOwn(IMAGE_CONTENT_TYPES, extension) ? IMAGE_CONTENT_TYPES[extension] : null;
}

/** Same-origin URL that serves a lesson image key. */
export function getImageStreamUrl(fileKey: string): string {
  return `/api/images/stream/${encodeURIComponent(fileKey)}`;
}

const SIGNING_WINDOW_SECONDS = 6 * 60 * 60;
const PRESIGN_TTL_SECONDS = 12 * 60 * 60;
const REDIRECT_MARGIN_SECONDS = 10 * 60;

/**
 * Presign parameters for gallery images. The signing date is floored to a
 * 6-hour window, so every request in the window gets the same URL and the
 * browser's cache of the image bytes keeps hitting. Each URL stays valid for
 * at least 6 hours after it is handed out, so the redirect itself can be
 * cached for less than that and never points at an expired URL.
 */
export function imagePresignWindow(nowMs: number) {
  const windowMs = SIGNING_WINDOW_SECONDS * 1000;
  return {
    signingDate: new Date(Math.floor(nowMs / windowMs) * windowMs),
    expiresIn: PRESIGN_TTL_SECONDS,
    redirectMaxAge: PRESIGN_TTL_SECONDS - SIGNING_WINDOW_SECONDS - REDIRECT_MARGIN_SECONDS,
  };
}
