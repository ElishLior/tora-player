import { sniffImage } from '@/lib/image-sniff';

/*
 * Limits of personal notes and their images, shared by the browser (checks
 * before resizing/uploading) and the server (authoritative checks). Kept free
 * of server and schema dependencies so client bundles stay small.
 */

/** Matches the `lesson_notes.body` check constraint. */
export const MAX_NOTE_LENGTH = 10000;
export const MAX_NOTE_IMAGES = 5;
/** Largest original a listener may pick; the browser downsizes it before upload. */
export const MAX_NOTE_IMAGE_BYTES = 8 * 1024 * 1024;
/** Longest side after client-side downscaling. */
export const NOTE_IMAGE_MAX_DIMENSION = 2000;

export interface NoteImageType {
  mime: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic';
  ext: 'jpg' | 'png' | 'webp' | 'heic';
}

export type NoteImageError = 'empty' | 'too_large' | 'unsupported' | 'too_many';

const HEIF_BRANDS: Record<string, true> = {
  heic: true,
  heix: true,
  hevc: true,
  hevx: true,
  heim: true,
  heis: true,
  hevm: true,
  hevs: true,
};

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

/** HEIC/HEIF still image: an ISO-BMFF `ftyp` box whose major (or, for `mif1`, a compatible) brand is HEVC-based. */
function isHeic(bytes: Uint8Array): boolean {
  if (bytes.length < 12 || ascii(bytes, 4, 4) !== 'ftyp') return false;
  const major = ascii(bytes, 8, 4);
  if (HEIF_BRANDS[major]) return true;
  if (major !== 'mif1') return false;
  const boxSize = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  const end = Math.min(boxSize, bytes.length);
  for (let offset = 16; offset + 4 <= end; offset += 4) {
    if (HEIF_BRANDS[ascii(bytes, offset, 4)]) return true;
  }
  return false;
}

/** JPEG, PNG, WebP or HEIC by magic bytes; everything else (GIF, SVG, spoofed files) is rejected. */
export function sniffNoteImage(bytes: Uint8Array): NoteImageType | null {
  const image = sniffImage(bytes);
  if (image) return image.ext === 'gif' ? null : (image as NoteImageType);
  return isHeic(bytes) ? { mime: 'image/heic', ext: 'heic' } : null;
}

/** Checks one image against the format, size and per-note count limits. */
export function validateNoteImage(input: {
  bytes: Uint8Array;
  size: number;
  existingCount: number;
}): { ok: true; type: NoteImageType } | { ok: false; error: NoteImageError } {
  if (input.existingCount >= MAX_NOTE_IMAGES) return { ok: false, error: 'too_many' };
  if (input.size <= 0) return { ok: false, error: 'empty' };
  if (input.size > MAX_NOTE_IMAGE_BYTES) return { ok: false, error: 'too_large' };
  const type = sniffNoteImage(input.bytes);
  return type ? { ok: true, type } : { ok: false, error: 'unsupported' };
}

/** Private R2 key of a note image. Only the owner's prefix is ever signed. */
export function noteImageKey(userId: string, noteId: string, imageId: string, ext: NoteImageType['ext']): string {
  return `user-notes/${userId}/${noteId}/${imageId}.${ext}`;
}

export function noteImagePrefix(userId: string, noteId?: string): string {
  return noteId ? `user-notes/${userId}/${noteId}/` : `user-notes/${userId}/`;
}

/** Same-origin URL that serves an image to its owner. */
export function noteImageUrl(imageId: string): string {
  return `/api/notes/images/${imageId}`;
}
