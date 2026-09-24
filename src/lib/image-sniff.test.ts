import { describe, expect, it } from 'vitest';
import { sniffImage } from './image-sniff';

const bytes = (...values: Array<number | string>) =>
  new Uint8Array(values.flatMap((v) => (typeof v === 'string' ? [...v].map((c) => c.charCodeAt(0)) : [v])));

describe('sniffImage', () => {
  it('detects the displayable raster formats from their signatures', () => {
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))?.mime).toBe('image/jpeg');
    expect(sniffImage(bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a))?.ext).toBe('png');
    expect(sniffImage(bytes('GIF89a'))?.ext).toBe('gif');
    expect(sniffImage(bytes('RIFF', 0, 0, 0, 0, 'WEBP'))?.mime).toBe('image/webp');
  });

  it('rejects SVG, HEIC and truncated or spoofed payloads', () => {
    expect(sniffImage(bytes('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniffImage(bytes(0, 0, 0, 0x18, 'ftypheic'))).toBeNull();
    expect(sniffImage(bytes(0xff, 0xd8))).toBeNull();
    expect(sniffImage(bytes('RIFF', 0, 0, 0, 0, 'WAVE'))).toBeNull();
  });
});
