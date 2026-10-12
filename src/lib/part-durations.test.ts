import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';
import heMessages from '../../messages/he.json';
import enMessages from '../../messages/en.json';
import { formatPartDurations, formatPartLength, splitPartLength } from './part-durations';

const he = createTranslator({ locale: 'he', messages: heMessages, namespace: 'partDurations' });
const en = createTranslator({ locale: 'en', messages: enMessages, namespace: 'partDurations' });

describe('splitPartLength', () => {
  it('treats 0, negative and missing lengths as unknown', () => {
    expect(splitPartLength(0)).toBeNull();
    expect(splitPartLength(-3)).toBeNull();
    expect(splitPartLength(null)).toBeNull();
    expect(splitPartLength(Number.NaN)).toBeNull();
  });

  it('keeps clips under a minute in seconds', () => {
    expect(splitPartLength(0.4)).toEqual({ unit: 'seconds', seconds: 1 });
    expect(splitPartLength(42.4)).toEqual({ unit: 'seconds', seconds: 42 });
    expect(splitPartLength(59.6)).toEqual({ unit: 'minutes', minutes: 1 });
  });

  it('rounds to whole minutes and never switches to hours', () => {
    expect(splitPartLength(2729)).toEqual({ unit: 'minutes', minutes: 45 });
    expect(splitPartLength(4925)).toEqual({ unit: 'minutes', minutes: 82 });
    expect(splitPartLength(7200)).toEqual({ unit: 'minutes', minutes: 120 });
  });
});

describe('formatPartLength', () => {
  it('uses localized units', () => {
    expect(formatPartLength(2729, en)).toBe('45 min');
    expect(formatPartLength(4925, he)).toBe('82 דק׳');
    expect(formatPartLength(30, he)).toBe('30 שנ׳');
    expect(formatPartLength(0, en)).toBeNull();
  });
});

describe('formatPartDurations', () => {
  it('shows nothing for a lesson without audio', () => {
    expect(formatPartDurations([], en)).toEqual([]);
  });

  it('shows only the length of a single part', () => {
    expect(formatPartDurations([2729], en)).toEqual(['45 min']);
    expect(formatPartDurations([0], en)).toEqual([]);
  });

  it('numbers every part of a multipart lesson with its own length', () => {
    expect(formatPartDurations([2700, 2280], en)).toEqual(['Part 1: 45 min', 'Part 2: 38 min']);
    expect(formatPartDurations([4925, 4223], he)).toEqual(['חלק 1: 82 דק׳', 'חלק 2: 70 דק׳']);
    expect(formatPartDurations([4925, 4223, 600], he)).toEqual(['חלק 1: 82 דק׳', 'חלק 2: 70 דק׳', 'חלק 3: 10 דק׳']);
    expect(formatPartDurations([60, 120, 180, 240, 300], en)).toEqual([
      'Part 1: 1 min',
      'Part 2: 2 min',
      'Part 3: 3 min',
      'Part 4: 4 min',
      'Part 5: 5 min',
    ]);
  });

  it('never shows 0 min for a part whose length is unknown', () => {
    expect(formatPartDurations([2700, 0], en)).toEqual(['Part 1: 45 min', 'Part 2']);
  });
});
