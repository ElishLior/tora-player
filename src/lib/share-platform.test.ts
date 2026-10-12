import { describe, expect, it } from 'vitest';
import { sharePlatform } from './share-platform';

describe('sharePlatform', () => {
  it('detects iPhone Safari as apple', () => {
    expect(
      sharePlatform({
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
        platform: 'iPhone',
        maxTouchPoints: 5,
      }),
    ).toBe('apple');
  });

  it('detects iPhone Chrome (CriOS) as apple', () => {
    expect(
      sharePlatform({
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1',
        platform: 'iPhone',
        maxTouchPoints: 5,
      }),
    ).toBe('apple');
  });

  it('detects iPad (pre-iPadOS 13 UA) as apple', () => {
    expect(
      sharePlatform({
        userAgent:
          'Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1.2 Mobile/15E148 Safari/604.1',
        platform: 'iPad',
        maxTouchPoints: 5,
      }),
    ).toBe('apple');
  });

  it('detects iPadOS desktop-mode UA as apple via touch points', () => {
    expect(
      sharePlatform({
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
        platform: 'MacIntel',
        maxTouchPoints: 5,
      }),
    ).toBe('apple');
  });

  it('detects iPod touch as apple', () => {
    expect(
      sharePlatform({
        userAgent:
          'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
        platform: 'iPod touch',
        maxTouchPoints: 5,
      }),
    ).toBe('apple');
  });

  it('detects macOS Safari as apple', () => {
    expect(
      sharePlatform({
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
        platform: 'MacIntel',
        maxTouchPoints: 0,
      }),
    ).toBe('apple');
  });

  it('detects macOS Chrome as apple', () => {
    expect(
      sharePlatform({
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        platform: 'MacIntel',
        maxTouchPoints: 0,
      }),
    ).toBe('apple');
  });

  it('detects Pixel 7 Chrome as android', () => {
    expect(
      sharePlatform({
        userAgent:
          'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
        platform: 'Linux armv8l',
        maxTouchPoints: 5,
      }),
    ).toBe('android');
  });

  it('detects Samsung Internet as android', () => {
    expect(
      sharePlatform({
        userAgent:
          'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36',
        platform: 'Linux armv8l',
        maxTouchPoints: 5,
      }),
    ).toBe('android');
  });

  it('treats Windows Chrome as other', () => {
    expect(
      sharePlatform({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        platform: 'Win32',
        maxTouchPoints: 0,
      }),
    ).toBe('other');
  });

  it('treats a touch Windows laptop as other, not apple', () => {
    expect(
      sharePlatform({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        platform: 'Win32',
        maxTouchPoints: 10,
      }),
    ).toBe('other');
  });

  it('treats Linux Firefox as other', () => {
    expect(
      sharePlatform({
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
        platform: 'Linux x86_64',
        maxTouchPoints: 0,
      }),
    ).toBe('other');
  });

  it('falls back to other when platform fields are missing', () => {
    expect(sharePlatform({ userAgent: 'SomeBot/1.0' })).toBe('other');
  });
});
