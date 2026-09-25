import { describe, expect, it } from 'vitest';
import { imagePresignWindow, servableImageContentType } from './image-keys';

describe('servableImageContentType', () => {
  it('serves lesson originals and thumbnails with their raster type', () => {
    expect(servableImageContentType('images/lesson-1/0_1.jpg')).toBe('image/jpeg');
    expect(servableImageContentType('images/lesson-1/0_1.JPEG')).toBe('image/jpeg');
    expect(servableImageContentType('images/lesson-1/thumbs/0_1.webp')).toBe('image/webp');
    expect(servableImageContentType('images/lesson-1/sha.png')).toBe('image/png');
  });

  it.each([
    'audio/lesson-1/0_1.jpg',
    'user-notes/uid/note/1.jpg',
    '_chunks/x/0.jpg',
    'images/../audio/lesson-1/0_1.jpg',
    'images/lesson-1\\..\\x.jpg',
    'images/lesson-1/evil.svg',
    'images/lesson-1/page.html',
    'images/lesson-1/noext',
    'images/lesson-1/x.constructor',
  ])('refuses %s', (key) => {
    expect(servableImageContentType(key)).toBeNull();
  });
});

describe('imagePresignWindow', () => {
  const HOUR = 3_600_000;

  it('gives every request in the same window the same signing date', () => {
    const start = Date.UTC(2026, 8, 24, 6);
    expect(imagePresignWindow(start).signingDate).toEqual(new Date(start));
    expect(imagePresignWindow(start + 6 * HOUR - 1).signingDate).toEqual(new Date(start));
    expect(imagePresignWindow(start + 6 * HOUR).signingDate).toEqual(new Date(start + 6 * HOUR));
  });

  it('never lets a cached redirect outlive the URL it points at', () => {
    const lastMomentOfWindow = Date.UTC(2026, 8, 24, 12) - 1;
    const { signingDate, expiresIn, redirectMaxAge } = imagePresignWindow(lastMomentOfWindow);
    const urlExpiresAt = signingDate.getTime() + expiresIn * 1000;
    expect(lastMomentOfWindow + redirectMaxAge * 1000).toBeLessThan(urlExpiresAt);
    expect(redirectMaxAge).toBeGreaterThan(0);
  });
});
