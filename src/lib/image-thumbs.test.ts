import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { createGalleryThumbnail, THUMB_WIDTH, thumbKeyFor, thumbnailSize } from './image-thumbs';

describe('thumbnailSize', () => {
  it('scales wide originals down to the thumbnail width, keeping the aspect ratio', () => {
    expect(thumbnailSize(2560, 1920)).toEqual({ width: THUMB_WIDTH, height: 360 });
    expect(thumbnailSize(1000, 3001)).toEqual({ width: 480, height: 1440 });
  });

  it('never enlarges originals at or below the thumbnail width', () => {
    expect(thumbnailSize(480, 640)).toEqual({ width: 480, height: 640 });
    expect(thumbnailSize(200, 100)).toEqual({ width: 200, height: 100 });
  });

  it('keeps at least one pixel of height for extreme panoramas', () => {
    expect(thumbnailSize(100_000, 10)).toEqual({ width: 480, height: 1 });
  });

  it('rejects missing or nonsensical dimensions', () => {
    expect(thumbnailSize(0, 100)).toBeNull();
    expect(thumbnailSize(100, -1)).toBeNull();
    expect(thumbnailSize(Number.NaN, 100)).toBeNull();
  });
});

describe('thumbKeyFor', () => {
  it('puts a .webp rendition in a thumbs/ folder next to the original', () => {
    expect(thumbKeyFor('images/lesson-1/0_1771972071176.jpg')).toBe('images/lesson-1/thumbs/0_1771972071176.webp');
    expect(thumbKeyFor('images/lesson-1/a.b.PNG')).toBe('images/lesson-1/thumbs/a.b.webp');
    expect(thumbKeyFor('images/lesson-1/noext')).toBe('images/lesson-1/thumbs/noext.webp');
  });
});

describe('createGalleryThumbnail', () => {
  it('records the displayed size of an EXIF-rotated original and renders an upright WebP', async () => {
    // 1200x800 pixels stored sideways (orientation 6 = rotate 90° to display): shown as 800x1200.
    const original = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#888' } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const result = await createGalleryThumbnail(original);

    expect({ width: result.width, height: result.height }).toEqual({ width: 800, height: 1200 });
    const thumb = await sharp(result.thumb).metadata();
    expect(thumb.format).toBe('webp');
    expect({ width: thumb.width, height: thumb.height }).toEqual({ width: 480, height: 720 });
  });

  it('throws on bytes that only look like an image', async () => {
    await expect(createGalleryThumbnail(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]))).rejects.toThrow();
  });
});
