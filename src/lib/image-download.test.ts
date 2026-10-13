import { describe, expect, it } from 'vitest';
import { buildImageDownloadNames, imageDownloadPath, sortLessonImages } from './image-download';

describe('imageDownloadPath', () => {
  it('routes by lesson_images id', () => {
    expect(imageDownloadPath('9d1f3c2a-6b7e-4a8d-9c1e-2f3a4b5c6d7e')).toBe(
      '/api/images/download/9d1f3c2a-6b7e-4a8d-9c1e-2f3a4b5c6d7e',
    );
  });
});

describe('buildImageDownloadNames', () => {
  it('names the file <title>-<n>.<ext> with the stored extension', () => {
    expect(buildImageDownloadNames({ title: 'שיעור בראשית', position: 3, extension: 'webp' })).toEqual({
      filename: 'שיעור בראשית-3.webp',
      asciiFilename: 'image-3.webp',
    });
  });

  it('gives an English title the same name in its ASCII fallback', () => {
    expect(buildImageDownloadNames({ title: 'Bereshit 1', position: 1, extension: 'PNG' })).toEqual({
      filename: 'Bereshit 1-1.png',
      asciiFilename: 'Bereshit 1-1.png',
    });
  });

  it('strips path separators, reserved and control characters from the title', () => {
    const { filename } = buildImageDownloadNames({ title: '../שיעור: א/ב?\u0007', position: 2, extension: 'jpg' });

    expect(filename).toBe('שיעור- א-ב-2.jpg');
    expect(filename).not.toMatch(/[\\/:*?"<>|\u0000-\u001f]/);
  });

  it('removes bidi override characters that could disguise the extension', () => {
    const { filename } = buildImageDownloadNames({ title: 'evil‮gnp', position: 1, extension: 'jpg' });

    expect(filename).toBe('evilgnp-1.jpg');
  });

  it('falls back to the slug, then to "image", when the title is unusable', () => {
    expect(buildImageDownloadNames({ title: ' .. ', slug: 'bereshit-1', position: 1, extension: 'jpg' }).filename).toBe(
      'bereshit-1-1.jpg',
    );
    expect(buildImageDownloadNames({ title: null, slug: null, position: 4, extension: 'jpg' })).toEqual({
      filename: 'image-4.jpg',
      asciiFilename: 'image-4.jpg',
    });
  });

  it('uses the ASCII name "image" for a Hebrew-only title, never a bare number', () => {
    expect(buildImageDownloadNames({ title: 'שיעור', position: 3, extension: 'jpg' }).asciiFilename).toBe(
      'image-3.jpg',
    );
  });

  it('trims a long title by code point, so the result still encodes', () => {
    const { filename } = buildImageDownloadNames({ title: '😀'.repeat(200), position: 1, extension: 'jpg' });

    expect(Array.from(filename.replace(/-1\.jpg$/, '')).length).toBe(120);
    expect(() => encodeURIComponent(filename)).not.toThrow();
  });

  it('keeps only letters and digits in the extension', () => {
    expect(buildImageDownloadNames({ title: 'x', position: 1, extension: '../jpg' }).filename).toBe('x-1.jpg');
  });
});

describe('sortLessonImages', () => {
  it('orders by sort_order and breaks ties by id, without mutating the input', () => {
    const input = [
      { id: 'b', sort_order: 1 },
      { id: 'c', sort_order: 0 },
      { id: 'a', sort_order: 1 },
    ];

    expect(sortLessonImages(input).map((row) => row.id)).toEqual(['c', 'a', 'b']);
    expect(input.map((row) => row.id)).toEqual(['b', 'c', 'a']);
  });
});
