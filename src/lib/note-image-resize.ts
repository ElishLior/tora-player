import {
  MAX_NOTE_IMAGE_BYTES,
  NOTE_IMAGE_MAX_DIMENSION,
  sniffNoteImage,
  type NoteImageError,
} from '@/lib/note-rules';

/*
 * Browser-side preparation of note images: format/size checks, then a
 * downscale to NOTE_IMAGE_MAX_DIMENSION re-encoded as WebP (JPEG where the
 * browser cannot encode WebP). Keeps uploads small and under the platform's
 * request body limit.
 */

/** Vercel rejects request bodies above ~4.5 MB. */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
/** Small originals that already fit are uploaded untouched. */
const KEEP_ORIGINAL_BYTES = 1.5 * 1024 * 1024;

export interface PreparedNoteImage {
  blob: Blob;
  width: number | null;
  height: number | null;
}

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Fall back to <img>, which decodes more formats on some browsers (HEIC on Safari).
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function prepareNoteImage(file: File): Promise<PreparedNoteImage | { error: NoteImageError }> {
  if (file.size === 0) return { error: 'empty' };
  if (file.size > MAX_NOTE_IMAGE_BYTES) return { error: 'too_large' };
  const type = sniffNoteImage(new Uint8Array(await file.slice(0, 64).arrayBuffer()));
  if (!type) return { error: 'unsupported' };

  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await decode(file);
  } catch {
    // This browser cannot decode it (typically HEIC outside Safari): upload the original when it fits.
    return file.size <= MAX_UPLOAD_BYTES ? { blob: file, width: null, height: null } : { error: 'unsupported' };
  }

  const sourceWidth = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const sourceHeight = 'naturalHeight' in source ? source.naturalHeight : source.height;
  const scale = Math.min(1, NOTE_IMAGE_MAX_DIMENSION / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  if (scale === 1 && file.size <= KEEP_ORIGINAL_BYTES && type.ext !== 'heic') {
    if ('close' in source) source.close();
    return { blob: file, width, height };
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return { error: 'unsupported' };
  // JPEG has no alpha: transparent areas become white instead of black.
  context.fillStyle = '#fff';
  context.fillRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);
  if ('close' in source) source.close();

  for (const quality of [0.85, 0.7, 0.55]) {
    let blob = await encode(canvas, 'image/webp', quality);
    // Browsers without a WebP encoder silently return PNG.
    if (!blob || blob.type !== 'image/webp') blob = await encode(canvas, 'image/jpeg', quality);
    if (blob && blob.size <= MAX_UPLOAD_BYTES) return { blob, width, height };
  }
  return { error: 'too_large' };
}
