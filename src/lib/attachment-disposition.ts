/**
 * Filenames for `Content-Disposition: attachment`, shared by the audio and the
 * lesson-image download routes. Extension-agnostic: callers decide which
 * extension a name must end with (audio keeps its audio extension, images
 * keep their raster one).
 */

/** Zero-width and bidi control characters: they can hide or reorder an extension. */
const INVISIBLE_CHARACTERS = /[​-‏‪-‮⁦-⁩؜﻿]/g;
/** Path separators, Windows-reserved characters and ASCII control characters. */
const RESERVED_CHARACTERS = /[\\/:*?"<>|\u0000-\u001f\u007f]+/g;
const MAX_NAME_CODE_POINTS = 160;

/**
 * A filename that is safe on every common filesystem and keeps Hebrew and other
 * non-Latin letters. Returns '' when nothing usable is left. Lengths count code
 * points, so a cut never splits a surrogate pair (encodeURIComponent would throw).
 */
export function sanitizeAttachmentName(name: string | null | undefined, maxCodePoints = MAX_NAME_CODE_POINTS): string {
  const cleaned = (name ?? '')
    .replace(INVISIBLE_CHARACTERS, '')
    .replace(RESERVED_CHARACTERS, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[.\-\s]+/, '')
    .replace(/[.\-\s]+$/, '');
  return Array.from(cleaned)
    .slice(0, maxCodePoints)
    .join('')
    .replace(/[.\-\s]+$/, '');
}

const EXTENSION = /\.([a-z0-9]{1,10})$/i;

/** ASCII-only rendering of a filename, for clients that ignore `filename*`. */
export function asciiFallbackFilename(filename: string): string {
  const extension = EXTENSION.exec(filename)?.[1];
  const base = extension ? filename.slice(0, -(extension.length + 1)) : filename;
  const asciiBase = base
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/[\\/:*?"<>|;]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[.\-\s]+/, '')
    .replace(/[.\-\s]+$/, '');
  const safeBase = asciiBase || 'file';
  return extension ? `${safeBase}.${extension}` : safeBase;
}

/**
 * RFC 6266 attachment header: an ASCII `filename` for old clients plus an
 * RFC 5987 `filename*` carrying the full UTF-8 name. Pass `asciiFilename` when
 * the default ASCII rendering would be misleading (a Hebrew-only name would
 * otherwise reduce to its digits).
 */
export function attachmentDisposition(
  filename: string,
  asciiFilename?: string,
  /** `inline` opens in the browser (a PDF viewer) but keeps the name for its own save button. */
  type: 'attachment' | 'inline' = 'attachment',
): string {
  const safeFilename = sanitizeAttachmentName(filename) || 'file';
  const fallback = asciiFilename ?? asciiFallbackFilename(safeFilename);
  const encoded = encodeURIComponent(safeFilename).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
