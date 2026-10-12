import { describe, expect, it } from 'vitest';
import { asciiFallbackFilename, attachmentDisposition, sanitizeAttachmentName } from './attachment-disposition';

describe('sanitizeAttachmentName', () => {
  it('keeps Hebrew letters and replaces path separators and reserved characters', () => {
    expect(sanitizeAttachmentName('שיעור / א: "ב"?*<>|')).toBe('שיעור - א- -ב');
  });

  it('removes control characters', () => {
    expect(sanitizeAttachmentName('a\u0000b\u001fc\u007fd')).toBe('a-b-c-d');
  });

  it('removes bidi and zero-width characters that could hide an extension', () => {
    expect(sanitizeAttachmentName('evil‮gnp.exe')).toBe('evilgnp.exe');
    expect(sanitizeAttachmentName('a​⁦b⁩.jpg')).toBe('ab.jpg');
  });

  it('collapses whitespace and trims leading and trailing dots, dashes and spaces', () => {
    expect(sanitizeAttachmentName('  ..  name   ..  ')).toBe('name');
  });

  it('cuts by code point so a surrogate pair is never split', () => {
    const cut = sanitizeAttachmentName('😀'.repeat(5), 3);

    expect(cut).toBe('😀😀😀');
    expect(() => encodeURIComponent(cut)).not.toThrow();
  });

  it('returns an empty string when nothing usable is left', () => {
    expect(sanitizeAttachmentName(' ../ ')).toBe('');
    expect(sanitizeAttachmentName(null)).toBe('');
  });
});

describe('asciiFallbackFilename', () => {
  it('keeps the extension and drops non-ASCII letters from the base', () => {
    expect(asciiFallbackFilename('שיעור 10.12.opus')).toBe('10.12.opus');
    expect(asciiFallbackFilename('lesson-3.jpg')).toBe('lesson-3.jpg');
  });

  it('uses "file" when the base has no ASCII left', () => {
    expect(asciiFallbackFilename('שיעור.pdf')).toBe('file.pdf');
  });
});

describe('attachmentDisposition', () => {
  it('uses the given ASCII fallback when provided', () => {
    expect(attachmentDisposition('שיעור-3.jpg', 'image-3.jpg')).toBe(
      `attachment; filename="image-3.jpg"; filename*=UTF-8''%D7%A9%D7%99%D7%A2%D7%95%D7%A8-3.jpg`,
    );
  });

  it('never returns a header with raw quotes or line breaks in the fallback', () => {
    const header = attachmentDisposition('a"b\r\nc.png');

    expect(header).not.toMatch(/[\r\n]/);
    expect(header).toContain('filename="a-b-c.png"');
  });
});
