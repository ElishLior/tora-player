/*
 * Lesson URL slugs: `<topic>-<DD-MM-YYYY>` (owner decision, October 8, 2026).
 *
 * - topic: the transliterated weekly reading or holiday for a full lesson
 *   (`haazinu`, `sukkot`), a reviewed topic for a short lesson, else `short` /
 *   `lesson`. Hebrew titles without niqqud cannot be transliterated reliably,
 *   so nothing here guesses at free text; an admin can edit any slug.
 * - date: the stored `lessons.date` (YYYY-MM-DD), written day-month-year.
 * - collisions: `-2`, `-3`, … after the date, first come first served.
 *
 * The lesson UUID stays the identity. Slugs only name URLs; an old UUID or a
 * replaced slug redirects to the current one (see src/lib/supabase/lesson-route.ts).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const MAX_LESSON_SLUG_LENGTH = 80;
export const SHORT_LESSON_TOPIC = 'short';
export const FALLBACK_LESSON_TOPIC = 'lesson';
const COLLISION_SUFFIX_ROOM = 4;

/** Weekly readings and holidays as stored in `lessons.parsha`, keyed without spaces/hyphens. */
const READING_TOPICS: Record<string, string> = {
  בראשית: 'bereshit',
  נח: 'noach',
  לךלך: 'lech-lecha',
  וירא: 'vayera',
  חיישרה: 'chayei-sarah',
  תולדות: 'toldot',
  ויצא: 'vayetze',
  וישלח: 'vayishlach',
  וישב: 'vayeshev',
  מקץ: 'miketz',
  ויגש: 'vayigash',
  ויחי: 'vayechi',
  שמות: 'shemot',
  וארא: 'vaera',
  בא: 'bo',
  בשלח: 'beshalach',
  יתרו: 'yitro',
  משפטים: 'mishpatim',
  תרומה: 'terumah',
  תצוה: 'tetzaveh',
  תצווה: 'tetzaveh',
  כיתשא: 'ki-tisa',
  ויקהל: 'vayakhel',
  פקודי: 'pekudei',
  ויקהלפקודי: 'vayakhel-pekudei',
  ויקרא: 'vayikra',
  צו: 'tzav',
  שמיני: 'shemini',
  תזריע: 'tazria',
  מצורע: 'metzora',
  מצרע: 'metzora',
  תזריעמצורע: 'tazria-metzora',
  תזריעמצרע: 'tazria-metzora',
  אחרימות: 'acharei-mot',
  קדושים: 'kedoshim',
  קדשים: 'kedoshim',
  אחרימותקדושים: 'acharei-mot-kedoshim',
  אחרימותקדשים: 'acharei-mot-kedoshim',
  אמור: 'emor',
  בהר: 'behar',
  בחקתי: 'bechukotai',
  בחוקותי: 'bechukotai',
  בהרבחקתי: 'behar-bechukotai',
  בהרבחוקותי: 'behar-bechukotai',
  במדבר: 'bamidbar',
  נשא: 'nasso',
  בהעלתך: 'behaalotecha',
  בהעלותך: 'behaalotecha',
  שלח: 'shelach',
  שלחלך: 'shelach',
  קרח: 'korach',
  חקת: 'chukat',
  חוקת: 'chukat',
  בלק: 'balak',
  פינחס: 'pinchas',
  פנחס: 'pinchas',
  מטות: 'matot',
  מסעי: 'masei',
  מטותמסעי: 'matot-masei',
  דברים: 'devarim',
  ואתחנן: 'vaetchanan',
  עקב: 'eikev',
  ראה: 'reeh',
  שופטים: 'shoftim',
  כיתצא: 'ki-tetze',
  כיתבוא: 'ki-tavo',
  נצבים: 'nitzavim',
  ניצבים: 'nitzavim',
  וילך: 'vayelech',
  נצביםוילך: 'nitzavim-vayelech',
  ניצביםוילך: 'nitzavim-vayelech',
  האזינו: 'haazinu',
  וזאתהברכה: 'vezot-haberacha',
  ראשהשנה: 'rosh-hashana',
  יוםכיפור: 'yom-kippur',
  יוםכפור: 'yom-kippur',
  יוםהכיפורים: 'yom-kippur',
  סוכות: 'sukkot',
  שמיניעצרת: 'shemini-atzeret',
  שמחתתורה: 'simchat-torah',
  חנוכה: 'chanukah',
  פורים: 'purim',
  פסח: 'pesach',
  שבועות: 'shavuot',
  פסחשבתחולהמועד: 'pesach-chol-hamoed',
  סוכותשבתחולהמועד: 'sukkot-chol-hamoed',
};

function readingKey(reading: string): string {
  return reading.replace(/[\s\-־׳״'"]/g, '');
}

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

export function isValidLessonSlug(value: string): boolean {
  return value.length <= MAX_LESSON_SLUG_LENGTH && SLUG.test(value) && !isUuid(value);
}

/** Lowercase ASCII words joined by single hyphens; anything else is dropped. */
export function slugifyAscii(text: string): string {
  return text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** `2026-09-18` → `18-09-2026`; null for anything that is not a stored DATE. */
export function slugDate(date: string): string | null {
  const match = ISO_DATE.exec(date);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

/** Transliterated reading/holiday for a stored `lessons.parsha`, or null when unknown. */
export function readingTopic(parsha: string | null | undefined): string | null {
  return parsha ? (READING_TOPICS[readingKey(parsha)] ?? null) : null;
}

export interface LessonSlugInput {
  date: string;
  parsha?: string | null;
  isShort?: boolean;
  /** Reviewed ASCII topic (e.g. from an admin); wins over every rule. */
  topic?: string | null;
}

/** The slug a lesson gets before collision handling, or null without a valid date. */
export function baseLessonSlug({ date, parsha, isShort, topic }: LessonSlugInput): string | null {
  const day = slugDate(date);
  if (!day) return null;
  const chosen =
    (topic && slugifyAscii(topic)) ||
    (isShort ? SHORT_LESSON_TOPIC : readingTopic(parsha)) ||
    FALLBACK_LESSON_TOPIC;
  // Leave room for a collision suffix (`-2` … `-999`) within the limit.
  const room = MAX_LESSON_SLUG_LENGTH - day.length - 1 - COLLISION_SUFFIX_ROOM;
  const trimmed = chosen.slice(0, room).replace(/-+$/, '');
  return `${trimmed}-${day}`;
}

/** `base`, else `base-2`, `base-3`, … — the first one `isTaken` rejects not. */
export function uniqueLessonSlug(base: string, isTaken: (slug: string) => boolean): string {
  if (!isTaken(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!isTaken(candidate)) return candidate;
  }
}
