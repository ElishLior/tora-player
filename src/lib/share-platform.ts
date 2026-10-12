export type SharePlatform = 'apple' | 'android' | 'other';

export interface SharePlatformInput {
  userAgent: string;
  /** `navigator.platform`, e.g. `MacIntel` for iPadOS desktop-mode requests. */
  platform?: string;
  maxTouchPoints?: number;
}

/**
 * Which OS share glyph the user expects. Apple devices (iPhone, iPad, iPod,
 * and macOS Safari/Chrome) show the square-with-arrow; Android and everything
 * else get the Material share glyph.
 */
export function sharePlatform({ userAgent, platform = '', maxTouchPoints = 0 }: SharePlatformInput): SharePlatform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'apple';
  if (/Android/i.test(userAgent)) return 'android';
  // iPadOS 13+ asks for the desktop site: the UA says Macintosh, touch points give it away.
  if (platform === 'MacIntel' && maxTouchPoints > 1) return 'apple';
  if (/Macintosh|Mac OS X/i.test(userAgent)) return 'apple';
  return 'other';
}
