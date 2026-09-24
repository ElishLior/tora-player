/**
 * Identify an uploaded image by its leading bytes instead of trusting the
 * client-supplied MIME type or extension. Only raster formats every browser
 * can display are accepted (no SVG: it can carry script).
 */
export interface SniffedImage {
  mime: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  ext: 'jpg' | 'png' | 'gif' | 'webp';
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)
  ) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (bytes.length >= 6 && (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a')) {
    return { mime: 'image/gif', ext: 'gif' };
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return null;
}
