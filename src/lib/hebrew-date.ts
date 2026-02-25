import { HDate, Sedra, Locale } from '@hebcal/core';

const HEBREW_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

/**
 * Strip Hebrew nikud (vowel marks / diacritics) from a string.
 * Unicode range U+0591–U+05C7 covers all Hebrew diacritical marks.
 */
function stripNikud(str: string): string {
  return str.replace(/[\u0591-\u05C7]/g, '');
}

/**
 * Generate lesson metadata from a Gregorian date string (YYYY-MM-DD).
 * Returns Hebrew date, parsha, day of week, and formatted title
 * in the same format as the imported WhatsApp lessons.
 *
 * Example output for 2025-10-22:
 *   title: "שיעור ל׳ תשרי תשפ״ו - יום רביעי | פרשת נח"
 *   hebrewDate: "ל׳ תשרי תשפ״ו"
 *   parsha: "נח"
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
  const sedra = new Sedra(hd.getFullYear(), false); // false = diaspora
  let parsha: string | null = null;
  try {
    const parshaResult = sedra.lookup(hd);
    if (parshaResult?.parsha?.length > 0) {
      parsha = stripNikud(
        parshaResult.parsha
          .map((p: string) => Locale.gettext(p, 'he') || p)
          .join('-')
      );
    }
  } catch {
    // No parsha for this date (e.g., holiday)
  }

  // Build title in exact same format as imported lessons:
  // "שיעור ל׳ תשרי תשפ״ו - יום רביעי | פרשת נח"
  let title = `שיעור ${hebrewDate} - יום ${hebrewDay}`;
  if (parsha) {
    title += ` | פרשת ${parsha}`;
  }

  return {
    title,
    hebrewTitle: title,
    hebrewDate,
    hebrewDay,
    parsha,
    dayOfWeek,
    teacher: 'אליהו',
    location: 'ציון בניהו בן יהוידע',
    lessonType: 'שיעור יומי',
  };
}
