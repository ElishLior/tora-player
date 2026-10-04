import { describe, expect, it } from 'vitest';
import { trustedPartDuration } from './part-duration';

describe('trustedPartDuration', () => {
  it('is unknown (0) when neither source has a usable length', () => {
    expect(trustedPartDuration({ catalog: 0, element: 0 })).toBe(0);
    expect(trustedPartDuration({ catalog: Number.NaN, element: Number.POSITIVE_INFINITY })).toBe(0);
    expect(trustedPartDuration({ catalog: -5, element: Number.NaN })).toBe(0);
  });

  it('uses the only source that is known', () => {
    expect(trustedPartDuration({ catalog: 540, element: 0 })).toBe(540);
    expect(trustedPartDuration({ catalog: 0, element: 540.4 })).toBe(540.4);
    expect(trustedPartDuration({ catalog: 600, element: Number.POSITIVE_INFINITY })).toBe(600);
  });

  it('keeps the longer length when the sources disagree, whichever one is short', () => {
    // WebKit measured 3712.2 for a file that really lasts 3819.05 (catalog 3819).
    expect(trustedPartDuration({ catalog: 3819, element: 3712.2 })).toBe(3819);
    // The catalog is the short one: a zero-ish or stale value must not cut the file short.
    expect(trustedPartDuration({ catalog: 3600, element: 3819.05 })).toBe(3819.05);
  });

  it('returns the element value when both agree', () => {
    expect(trustedPartDuration({ catalog: 4642, element: 4642.4065 })).toBe(4642.4065);
  });
});
