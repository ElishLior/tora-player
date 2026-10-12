/*
 * Colours and labels for lesson rows on the home page. Pure, so the server
 * page and client rows agree. Colours are HSL triples ("199 89% 66%") meant
 * for `hsl(var(--pc))` in Tailwind arbitrary values, with `--pc` set inline.
 */

/** Part 1 sky, part 2 amber, then more hues. Repeats after the list ends. */
const PART_COLORS = ['199 89% 66%', '40 92% 62%', '262 80% 74%', '172 62% 56%', '330 80% 72%'] as const;

/** Tile hues per reading. The same reading always gets the same hue. */
const READING_HUES = [152, 262, 28, 199, 330, 40, 172, 350] as const;

export function partColor(index: number): string {
  const count = PART_COLORS.length;
  return PART_COLORS[((index % count) + count) % count];
}

/** A stable hue for a reading name (parsha or holiday), so its tiles keep one colour. */
export function readingHue(reading: string): number {
  let hash = 0;
  for (const char of reading) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return READING_HUES[hash % READING_HUES.length];
}

export interface HebrewDayMonth {
  day: string;
  month: string;
}

/** "כ״ח תשרי תשפ״ז" → day "כ״ח", month "תשרי" ("כ״ח אדר א׳ תשפ״ז" → month "אדר א׳"). Null when the stored date is missing or unusual. */
export function hebrewDayMonth(hebrewDate: string | null | undefined): HebrewDayMonth | null {
  const parts = hebrewDate?.trim().split(/\s+/) ?? [];
  if (parts.length < 2) return null;
  // Everything between the day and the year: "אדר א׳" keeps its letter.
  return { day: parts[0], month: parts.length > 2 ? parts.slice(1, -1).join(' ') : parts[1] };
}
