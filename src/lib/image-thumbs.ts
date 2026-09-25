import sharp from 'sharp';

/**
 * Gallery thumbnails: a small WebP rendition of each lesson image, stored
 * next to the original, shown in the lesson page grid (the lightbox keeps the
 * original). Also imported by `scripts/backfill-image-thumbs.mjs`
 * (node --experimental-strip-types): keep it erasable TypeScript without
 * relative imports.
 */

/** Thumbnail width in pixels: sharp in a 3-4 column grid on a 3x phone screen. */
export const THUMB_WIDTH = 480;
const THUMB_WEBP_QUALITY = 72;

export interface ImageSize {
  width: number;
  height: number;
}

/**
 * Thumbnail size for an original of `width`x`height`: scaled to at most
 * `maxWidth` wide with the aspect ratio kept, never enlarged. Null for
 * missing or nonsensical dimensions.
 */
export function thumbnailSize(width: number, height: number, maxWidth = THUMB_WIDTH): ImageSize | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return null;
  if (width <= maxWidth) return { width: Math.round(width), height: Math.round(height) };
  return { width: maxWidth, height: Math.max(1, Math.round((height * maxWidth) / width)) };
}

/** `images/<lesson>/<name>.<ext>` → `images/<lesson>/thumbs/<name>.webp`. */
export function thumbKeyFor(fileKey: string): string {
  const slash = fileKey.lastIndexOf('/');
  const dir = fileKey.slice(0, slash + 1);
  const name = fileKey.slice(slash + 1);
  const dot = name.lastIndexOf('.');
  return `${dir}thumbs/${dot > 0 ? name.slice(0, dot) : name}.webp`;
}

export interface GalleryThumbnail extends ImageSize {
  /** Width/height are the original's as displayed (EXIF orientation applied). */
  thumb: Buffer;
}

/** Reads an image and renders its auto-oriented WebP thumbnail. Throws on undecodable input. */
export async function createGalleryThumbnail(input: Buffer): Promise<GalleryThumbnail> {
  const { autoOrient } = await sharp(input).metadata();
  const size = thumbnailSize(autoOrient.width, autoOrient.height);
  if (!size) throw new Error('Image has no readable dimensions');
  const thumb = await sharp(input)
    .autoOrient()
    .resize({ width: size.width, height: size.height, fit: 'fill' })
    .webp({ quality: THUMB_WEBP_QUALITY })
    .toBuffer();
  return { width: autoOrient.width, height: autoOrient.height, thumb };
}
