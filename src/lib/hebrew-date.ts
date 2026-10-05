import { HDate, Sedra, Locale } from '@hebcal/core';
import { parshaLabel } from './parsha-label';

const HEBREW_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

/**
 * Title wording for a holiday reading, keyed by the calendar's English reading
 * name. A holiday is not a "parsha", so it never gets the "פרשת" prefix. The
 * owner asked for Sukkot to read "חג הסוכות"; other wording below is a proposal and
 * can be changed here.
 */
const HOLIDAY_TITLES: Record<string, string> = {
  Sukkot: 'חג הסוכות',
};

/**
 * Strip Hebrew nikud (vowel marks / diacritics) from a string.
 * Unicode range U+0591–U+05C7 covers all Hebrew diacritical marks.
 */
function stripNikud(str: string): string {
  return str.replace(/[\u0591-\u05C7]/g, '');
}

/**
 * "חג הסוכות" for Sukkot itself; "שבת חול המועד סוכות" (Shabbat first, as people
 * say it) for the Shabbat of the intermediate days of Sukkot or Pesach; any other
 * holiday keeps the calendar's Hebrew name.
 */
function holidayTitleFor(englishName: string, hebrewName: string): string {
  return HOLIDAY_TITLES[englishName] ?? parshaLabel(hebrewName);
}

/**
 * Generate lesson metadata from a Gregorian date string (YYYY-MM-DD).
 * Returns Hebrew date, parsha, day of week, and formatted title
 * in the same format as the imported WhatsApp lessons.
 *
 * Example output for a Friday (2026-10-09):
 *   title: "ליל שישי - כ״ח תשרי תשפ״ז | פרשת בראשית"
 *   hebrewDate: "כ״ח תשרי תשפ״ז"
 *   parsha: "בראשית"
 *
 * When the Friday falls on a holiday the reading is the holiday, not a weekly
 * portion (2026-09-25): title "ליל שישי - י״ד תשרי תשפ״ז | חג הסוכות",
 * parsha "סוכות" (the stored column keeps the reading name), isHolidayReading true.
 */
export function generateLessonMetadata(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const gDate = new Date(year, month - 1, day);
  const hd = new HDate(gDate);

  // Hebrew date string without nikud: "ל׳ תשרי תשפ״ו"
  const hebrewDate = stripNikud(hd.renderGematriya());

  // Day of week in Hebrew
  const dayOfWeek = gDate.getDay(); // 0=Sunday
  const hebrewDay = HEBREW_DAYS[dayOfWeek];

  // Get parsha (weekly Torah portion)
  const sedra = new Sedra(hd.getFullYear(), true); // true = Israel schedule (lessons are in Jerusalem)
  let parsha: string | null = null;
  let isHolidayReading = false;
  let holidayTitle: string | null = null;
  try {
    const parshaResult = sedra.lookup(hd);
    if (parshaResult?.parsha?.length > 0) {
      parsha = stripNikud(
        parshaResult.parsha
          .map((p: string) => Locale.gettext(p, 'he') || p)
          .join('-')
      );
      isHolidayReading = parshaResult.chag === true;
      if (isHolidayReading) holidayTitle = holidayTitleFor(parshaResult.parsha[0], parsha);
    }
  } catch {
    // No parsha for this date (e.g., holiday)
  }

  // Build title with new convention:
  // Friday (dayOfWeek === 5): "ליל שישי - ל׳ תשרי תשפ״ו | פרשת נח"
  // Other days:                "יום רביעי - ל׳ תשרי תשפ״ו"
  const isFriday = dayOfWeek === 5;
  let title: string;
  if (isFriday) {
    title = `ליל שישי - ${hebrewDate}`;
    if (holidayTitle) {
      title += ` | ${holidayTitle}`;
    } else if (parsha) {
      title += ` | פרשת ${parsha}`;
    }
  } else {
    title = `יום ${hebrewDay} - ${hebrewDate}`;
  }

  return {
    title,
    hebrewTitle: title,
    hebrewDate,
    hebrewDay,
    parsha,
    /** True when `parsha` names a holiday reading rather than a weekly portion. */
    isHolidayReading,
    /** The reading as it appears in a title: "פרשת נח" or "חג הסוכות". */
    readingLabel: parsha ? (holidayTitle ?? `פרשת ${parsha}`) : null,
    dayOfWeek,
    teacher: 'אליהו',
    location: 'ציון בניהו בן יהוידע',
    lessonType: 'שיעור יומי',
  };
}
