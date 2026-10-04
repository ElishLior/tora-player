import { describe, expect, it } from 'vitest';
import { generateLessonMetadata } from './hebrew-date';

describe('generateLessonMetadata Friday title', () => {
  it('prefixes an ordinary weekly portion with פרשת', () => {
    const meta = generateLessonMetadata('2026-10-09');
    expect(meta.title).toBe('ליל שישי - כ״ח תשרי תשפ״ז | פרשת בראשית');
    expect(meta.parsha).toBe('בראשית');
    expect(meta.isHolidayReading).toBe(false);
  });

  it('joins a real double portion under one פרשת prefix', () => {
    const meta = generateLessonMetadata('2027-09-24');
    expect(meta.parsha).toBe('נצבים-וילך');
    expect(meta.title).toBe('ליל שישי - כ״ב אלול תשפ״ז | פרשת נצבים-וילך');
    expect(meta.isHolidayReading).toBe(false);
  });

  it('names the Sukkot Friday חג הסוכות, not פרשת סוכות', () => {
    const meta = generateLessonMetadata('2026-09-25');
    expect(meta.title).toBe('ליל שישי - י״ד תשרי תשפ״ז | חג הסוכות');
    expect(meta.hebrewTitle).toBe(meta.title);
    expect(meta.isHolidayReading).toBe(true);
    // The stored parsha column keeps the reading name; cards and the lesson page show it as is.
    expect(meta.parsha).toBe('סוכות');
  });

  it('never puts פרשת in front of a holiday reading', () => {
    const holidayFridays = ['2026-09-11', '2026-10-02', '2026-04-03', '2025-10-10'];
    for (const date of holidayFridays) {
      const meta = generateLessonMetadata(date);
      expect(meta.isHolidayReading, date).toBe(true);
      expect(meta.title, date).not.toContain('פרשת');
    }
  });

  it('puts the Chol HaMoed Shabbat first, as people say it', () => {
    expect(generateLessonMetadata('2025-10-10').title).toBe('ליל שישי - י״ח תשרי תשפ״ו | שבת חול המועד סוכות');
    expect(generateLessonMetadata('2026-04-03').title).toBe('ליל שישי - ט״ז ניסן תשפ״ו | שבת חול המועד פסח');
  });

  it('uses the holiday name from the calendar for other holidays', () => {
    expect(generateLessonMetadata('2026-09-11').title).toBe('ליל שישי - כ״ט אלול תשפ״ו | ראש השנה');
    expect(generateLessonMetadata('2026-10-02').title).toBe('ליל שישי - כ״א תשרי תשפ״ז | שמיני עצרת');
  });

  it('leaves non-Friday titles unchanged, even the week before a holiday', () => {
    // On a weekday the calendar returns the coming Shabbat's reading (Sukkot here);
    // only Friday titles carry a reading.
    expect(generateLessonMetadata('2026-09-24').title).toBe('יום חמישי - י״ג תשרי תשפ״ז');
    expect(generateLessonMetadata('2026-10-07').title).toBe('יום רביעי - כ״ו תשרי תשפ״ז');
  });
});
