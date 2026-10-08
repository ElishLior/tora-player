import { describe, expect, it } from 'vitest';
import {
  baseLessonSlug,
  isUuid,
  isValidLessonSlug,
  readingTopic,
  slugDate,
  slugifyAscii,
  uniqueLessonSlug,
} from './lesson-slugs';

describe('lesson slugs', () => {
  it('writes the stored date day-month-year', () => {
    expect(slugDate('2026-09-18')).toBe('18-09-2026');
    expect(slugDate('18.09.2026')).toBeNull();
    expect(slugDate('')).toBeNull();
  });

  it.each([
    ['האזינו', 'haazinu'],
    ['כי תבוא', 'ki-tavo'],
    ['כיתבוא', 'ki-tavo'],
    ['מטות-מסעי', 'matot-masei'],
    ['נצבים-וילך', 'nitzavim-vayelech'],
    ['ניצבים-וילך', 'nitzavim-vayelech'],
    ['שלחלך', 'shelach'],
    ['תזריע-מצרע', 'tazria-metzora'],
    ['אחרי מות-קדשים', 'acharei-mot-kedoshim'],
    ['סוכות', 'sukkot'],
    ['ראש השנה', 'rosh-hashana'],
    ['פסח שבת חול המועד', 'pesach-chol-hamoed'],
  ])('transliterates the reading %s', (parsha, topic) => {
    expect(readingTopic(parsha)).toBe(topic);
  });

  it('returns null for an unknown or empty reading', () => {
    expect(readingTopic('משהו אחר')).toBeNull();
    expect(readingTopic(null)).toBeNull();
  });

  it('builds <topic>-<DD-MM-YYYY>', () => {
    expect(baseLessonSlug({ date: '2026-09-18', parsha: 'האזינו' })).toBe('haazinu-18-09-2026');
    expect(baseLessonSlug({ date: '2026-09-25', parsha: 'סוכות' })).toBe('sukkot-25-09-2026');
  });

  it('uses "short" for a short lesson and "lesson" for an unknown reading, unless a reviewed topic is given', () => {
    expect(baseLessonSlug({ date: '2025-09-12', parsha: 'כיתבוא', isShort: true })).toBe('short-12-09-2025');
    expect(baseLessonSlug({ date: '2026-01-01', parsha: null })).toBe('lesson-01-01-2026');
    expect(baseLessonSlug({ date: '2026-02-10', isShort: true, topic: 'Likutei Moharan Torah 14' })).toBe(
      'likutei-moharan-torah-14-10-02-2026',
    );
  });

  it('returns null without a valid stored date', () => {
    expect(baseLessonSlug({ date: 'junk', parsha: 'נח' })).toBeNull();
  });

  it('keeps every slug within the length limit', () => {
    const slug = baseLessonSlug({ date: '2026-02-10', topic: 'a'.repeat(200) })!;
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(isValidLessonSlug(slug)).toBe(true);
    const suffixed = uniqueLessonSlug(slug, (candidate) => candidate === slug);
    expect(suffixed).toBe(`${slug}-2`);
    expect(isValidLessonSlug(suffixed)).toBe(true);
  });

  it('adds -2, -3 after the date on collisions', () => {
    const taken = new Set(['short-12-09-2025', 'short-12-09-2025-2']);
    expect(uniqueLessonSlug('short-12-09-2025', (slug) => taken.has(slug))).toBe('short-12-09-2025-3');
    expect(uniqueLessonSlug('haazinu-18-09-2026', () => false)).toBe('haazinu-18-09-2026');
  });

  it('validates slugs and never mistakes a UUID for one', () => {
    expect(isValidLessonSlug('haazinu-18-09-2026')).toBe(true);
    expect(isValidLessonSlug('Haazinu-18-09-2026')).toBe(false);
    expect(isValidLessonSlug('haazinu--18')).toBe(false);
    expect(isValidLessonSlug('-haazinu')).toBe(false);
    expect(isValidLessonSlug('fb296bdf-9d25-4832-a2d9-262875d48a29')).toBe(false);
    expect(isUuid('fb296bdf-9d25-4832-a2d9-262875d48a29')).toBe(true);
    expect(isUuid('haazinu-18-09-2026')).toBe(false);
  });

  it('reduces free text to lowercase ASCII words', () => {
    expect(slugifyAscii('  Sod Purim & Pras! ')).toBe('sod-purim-pras');
    expect(slugifyAscii('שורש')).toBe('');
  });
});
