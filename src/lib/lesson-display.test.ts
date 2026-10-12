import { describe, expect, it } from 'vitest';
import { hebrewDayMonth, partColor, readingHue } from './lesson-display';

describe('partColor', () => {
  it('gives part 1 and part 2 their colours and cycles after that', () => {
    expect(partColor(0)).toBe('199 89% 66%');
    expect(partColor(1)).toBe('40 92% 62%');
    expect(partColor(5)).toBe(partColor(0));
    expect(partColor(-1)).toBe(partColor(4));
  });
});

describe('readingHue', () => {
  it('is stable for the same reading', () => {
    expect(readingHue('נח')).toBe(readingHue('נח'));
    expect(typeof readingHue('בראשית')).toBe('number');
  });
});

describe('hebrewDayMonth', () => {
  it('splits a stored Hebrew date into day and month', () => {
    expect(hebrewDayMonth('כ״ח תשרי תשפ״ז')).toEqual({ day: 'כ״ח', month: 'תשרי' });
    expect(hebrewDayMonth('כ״ח אדר א׳ תשפ״ז')).toEqual({ day: 'כ״ח', month: 'אדר א׳' });
    expect(hebrewDayMonth('  י״ד   תשרי תשפ״ז ')).toEqual({ day: 'י״ד', month: 'תשרי' });
  });

  it('returns null without a usable date', () => {
    expect(hebrewDayMonth(null)).toBeNull();
    expect(hebrewDayMonth('')).toBeNull();
    expect(hebrewDayMonth('תשרי')).toBeNull();
  });
});
