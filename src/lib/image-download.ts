/**
 * Lesson image downloads: the route URL, the saved filename and the gallery
 * order. Pure and dependency-free, so the route, the lightbox and the tests
 * share one rule.
 */

import { sanitizeAttachmentName } from '@/lib/attachment-disposition';

/** Same-origin route that 302s to a presigned R2 attachment for one `lesson_images` row. */
export function imageDownloadPath(imageId: string): string {
  return `/api/images/download/${encodeURIComponent(imageId)}`;
}

/**
 * Gallery order, shared by the grid, the lightbox counter and the download
 * number: `sort_order`, then `id` so equal orders never swap between renders.
 */
export function sortLessonImages<T extends { id: string; sort_order: number }>(images: readonly T[]): T[] {
  return [...images].sort((a, b) => a.sort_order - b.sort_order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

const MAX_BASE_CODE_POINTS = 120;
const FALLBACK_BASE = 'image';

/**
 * Saved filename for one lesson image: `<lesson title>-<n>.<ext>`, where `n`
 * is the lightbox number (1-based) and the extension comes from the stored
 * original. Falls back to the slug, then to `image`, when the title sanitises
 * to nothing.
 *
 * `asciiFilename` is the plain-ASCII rendering for clients that ignore
 * RFC 5987. A Hebrew-only title gives `image-3.jpg`, not `3.jpg`.
 */
export function buildImageDownloadNames({
  title,
  slug,
  position,
  extension,
}: {
  title?: string | null;
  slug?: string | null;
  position: number;
  extension: string;
}): { filename: string; asciiFilename: string } {
  const ext = extension.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
  const base =
    sanitizeAttachmentName(title, MAX_BASE_CODE_POINTS) ||
    sanitizeAttachmentName(slug, MAX_BASE_CODE_POINTS) ||
    FALLBACK_BASE;
  const asciiBase =
    base
      .normalize('NFKD')
      .replace(/[^\x20-\x7e]/g, '')
      .replace(/[\\/:*?"<>|;]+/g, '-')
      .replace(/\s+/g, ' ')
      .replace(/^[.\-\s]+/, '')
      .replace(/[.\-\s]+$/, '') || FALLBACK_BASE;

  return {
    filename: `${base}-${position}.${ext}`,
    asciiFilename: `${asciiBase}-${position}.${ext}`,
  };
}
