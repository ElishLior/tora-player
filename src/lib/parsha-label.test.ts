import { describe, expect, it } from 'vitest';
import { parshaLabel } from './parsha-label';

describe('parshaLabel', () => {
  it('puts the Chol HaMoed Shabbat first, as people say it', () => {
    expect(parshaLabel('פסח שבת חול המועד')).toBe('שבת חול המועד פסח');
    expect(parshaLabel('סוכות שבת חול המועד')).toBe('שבת חול המועד סוכות');
  });

  it('keeps weekly portions and other holiday names as stored', () => {
    expect(parshaLabel('בראשית')).toBe('בראשית');
    expect(parshaLabel('נצבים-וילך')).toBe('נצבים-וילך');
    expect(parshaLabel('סוכות')).toBe('סוכות');
    expect(parshaLabel('שמחת תורה')).toBe('שמחת תורה');
  });
});
