import { describe, expect, it } from 'vitest';
import { MAX_NOTE_IMAGE_BYTES, MAX_NOTE_IMAGES, validateNoteImage } from './note-rules';

const bytes = (...values: Array<number | string>) =>
  new Uint8Array(values.flatMap((v) => (typeof v === 'string' ? [...v].map((c) => c.charCodeAt(0)) : [v])));

const jpeg = bytes(0xff, 0xd8, 0xff, 0xe0);
const check = (data: Uint8Array, size = data.length, existingCount = 0) =>
  validateNoteImage({ bytes: data, size, existingCount });

describe('validateNoteImage', () => {
  it('accepts JPEG, PNG, WebP and HEIC by their magic bytes', () => {
    expect(check(jpeg)).toEqual({ ok: true, type: { mime: 'image/jpeg', ext: 'jpg' } });
    expect(check(bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a))).toMatchObject({ ok: true, type: { ext: 'png' } });
    expect(check(bytes('RIFF', 0, 0, 0, 0, 'WEBP'))).toMatchObject({ ok: true, type: { ext: 'webp' } });
    expect(check(bytes(0, 0, 0, 0x18, 'ftypheic', 0, 0, 0, 0))).toMatchObject({ ok: true, type: { mime: 'image/heic' } });
    // iPhone-style `mif1` major brand with `heic` among the compatible brands.
    expect(check(bytes(0, 0, 0, 0x1c, 'ftypmif1', 0, 0, 0, 0, 'mif1heic'))).toMatchObject({ ok: true, type: { ext: 'heic' } });
  });

  it('rejects GIF, AVIF, SVG and spoofed payloads whatever the file claims to be', () => {
    expect(check(bytes('GIF89a'))).toEqual({ ok: false, error: 'unsupported' });
    expect(check(bytes(0, 0, 0, 0x1c, 'ftypavif', 0, 0, 0, 0, 'mif1avif'))).toEqual({ ok: false, error: 'unsupported' });
    expect(check(bytes('<svg xmlns="http://www.w3.org/2000/svg">'))).toEqual({ ok: false, error: 'unsupported' });
    expect(check(bytes('hello.jpg'))).toEqual({ ok: false, error: 'unsupported' });
  });

  it('allows exactly the 8 MB limit and nothing above it, and rejects empty files', () => {
    expect(check(jpeg, MAX_NOTE_IMAGE_BYTES).ok).toBe(true);
    expect(check(jpeg, MAX_NOTE_IMAGE_BYTES + 1)).toEqual({ ok: false, error: 'too_large' });
    expect(check(new Uint8Array(), 0)).toEqual({ ok: false, error: 'empty' });
  });

  it('allows the fifth image of a note but not a sixth', () => {
    expect(check(jpeg, jpeg.length, MAX_NOTE_IMAGES - 1).ok).toBe(true);
    expect(check(jpeg, jpeg.length, MAX_NOTE_IMAGES)).toEqual({ ok: false, error: 'too_many' });
  });
});
