/**
 * Turns a batch of dropped media files into lesson drafts for the admin
 * upload. Pure: no DOM, no network, so the grouping rules are testable.
 *
 * Rules:
 * - WhatsApp / recorder files are grouped by the calendar date in their name
 *   (a 00:30 file belongs to that date, never to the previous day).
 * - Human-named files that carry a date and a topic ("אליהו 29.01.2026 נושא.mp3")
 *   are short lessons, one draft per file, titled by the topic.
 * - Files without a detectable date use the fallback date (today in Jerusalem)
 *   and need the admin to confirm the date before upload.
 * - Daily parts are typed by posting order: 1st סידור, 2nd עץ חיים. Clips under
 *   two minutes are flagged and left out by default.
 * - Images join the daily draft of their date (or a short of that date).
 * - A daily draft whose date already has a daily lesson in the DB is appended
 *   to that lesson (new parts continue its order) instead of duplicating it;
 *   files already stored on a lesson of that date are skipped.
 */
import { generateLessonMetadata } from '@/lib/hebrew-date';
import {
  compareMediaFilenames,
  LESSON_PART_TYPES,
  mediaKindOf,
  parseMediaFilename,
  SHORTS_AUDIO_TYPE,
} from '@/lib/lesson-naming';
import { normalizeTags } from '@/lib/tags';

export const DAILY_CATEGORY_ID = '10000000-0000-0000-0000-000000000011';
export const SHORTS_CATEGORY_ID = '10000000-0000-0000-0000-000000000005';
export const SHORT_LESSON_TYPE = 'short_clip';
/** Daily lesson parts shorter than this are probably announcements, not lesson parts. */
export const MIN_LESSON_PART_SECONDS = 120;

export interface UploadCandidate {
  id: string;
  name: string;
  size: number;
  /** Seconds read from the audio metadata; null when unknown or not audio. */
  durationSec: number | null;
}

export interface DraftAudioPart {
  fileId: string;
  name: string;
  size: number;
  durationSec: number | null;
  include: boolean;
  audioType: string | null;
  /** Under MIN_LESSON_PART_SECONDS in a daily lesson. */
  tooShort: boolean;
  /** Title of an existing lesson that already has this file, when detected. */
  duplicateOf: string | null;
}

export interface DraftImage {
  fileId: string;
  name: string;
  size: number;
  /** Title of an existing lesson that already has this image; such images are skipped. */
  duplicateOf: string | null;
}

/** The daily lesson already stored on a draft's date. */
export interface ExistingLesson {
  id: string;
  title: string;
  isPublished: boolean;
  /** Audio parts it already has; appended parts are typed after them. */
  audioCount: number;
  nextAudioSort: number;
  nextImageSort: number;
}

export interface LessonDraft {
  key: string;
  date: string;
  /** False when the date came from the fallback (no date in any filename). */
  dateFromFilename: boolean;
  /** Admin set or confirmed the date of an undated draft. */
  dateConfirmed: boolean;
  isShort: boolean;
  title: string;
  /** Admin typed the title; stop regenerating it. */
  titleEdited: boolean;
  /** Admin changed part inclusion/types/order; stop re-assigning them. */
  partsEdited: boolean;
  /** Topic from the filename, used as the short-lesson title. */
  label: string;
  categoryId: string;
  description: string;
  tags: string[];
  /** Admin left this lesson out of the batch. */
  excluded: boolean;
  /** Daily lesson already in the DB on this date (server lookup). */
  existing: ExistingLesson | null;
  /** Append to `existing` rather than create a new lesson (admin may opt out). */
  appendToExisting: boolean;
  audio: DraftAudioPart[];
  images: DraftImage[];
}

export interface BuildDraftsResult {
  drafts: LessonDraft[];
  /** Files that are neither audio nor image (documents, videos, ...). */
  unsupportedIds: string[];
}

/** Today's calendar date in Israel, YYYY-MM-DD (not the UTC date). */
export function jerusalemToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

const WEEKDAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

/** Compact Hebrew day label for list rows: "ג׳ 18.8". */
export function formatDraftDay(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${WEEKDAY_LETTERS[weekday]}׳ ${day}.${month}`;
}

/** Auto title: topic label for shorts, "יום X - <hebrew date>" for daily lessons. */
function titleFor(draft: Pick<LessonDraft, 'isShort' | 'label' | 'date'>): string {
  const meta = generateLessonMetadata(draft.date);
  if (draft.isShort) return draft.label || `שיעור קצר - ${meta.hebrewDate}`;
  return meta.title;
}

function withAutoTitle(draft: LessonDraft): LessonDraft {
  return draft.titleEdited ? draft : { ...draft, title: titleFor(draft) };
}

/** The existing lesson this draft adds to, or null when it creates a new lesson. */
export function appendTarget(draft: Pick<LessonDraft, 'isShort' | 'appendToExisting' | 'existing'>): ExistingLesson | null {
  return !draft.isShort && draft.appendToExisting ? draft.existing : null;
}

/**
 * Recompute include/type/tooShort from durations, posting order and duplicates.
 * `startPosition` skips part types the target lesson already has.
 */
export function assignParts(audio: DraftAudioPart[], isShort: boolean, startPosition = 0): DraftAudioPart[] {
  let position = startPosition;
  return audio.map((part) => {
    const tooShort =
      !isShort && part.durationSec != null && part.durationSec < MIN_LESSON_PART_SECONDS;
    const include = !tooShort && !part.duplicateOf;
    let audioType: string | null = null;
    if (include) {
      audioType = isShort ? SHORTS_AUDIO_TYPE : (LESSON_PART_TYPES[position] ?? null);
      position++;
    }
    return { ...part, tooShort, include, audioType };
  });
}

/** Re-type parts after a change of target/duplicates; admin-edited parts only lose duplicates. */
function retypeParts(draft: LessonDraft): LessonDraft {
  if (draft.partsEdited) {
    return { ...draft, audio: draft.audio.map((p) => (p.duplicateOf ? { ...p, include: false } : p)) };
  }
  return { ...draft, audio: assignParts(draft.audio, draft.isShort, appendTarget(draft)?.audioCount ?? 0) };
}

function newDraft(key: string, date: string, dateFromFilename: boolean, isShort: boolean, label: string): LessonDraft {
  return withAutoTitle({
    key,
    date,
    dateFromFilename,
    dateConfirmed: false,
    isShort,
    title: '',
    titleEdited: false,
    partsEdited: false,
    label,
    categoryId: isShort ? SHORTS_CATEGORY_ID : DAILY_CATEGORY_ID,
    description: '',
    tags: [],
    excluded: false,
    existing: null,
    appendToExisting: true,
    audio: [],
    images: [],
  });
}

/** List order: by date, daily lesson before shorts of the same day. */
export function compareDrafts(a: LessonDraft, b: LessonDraft): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return Number(a.isShort) - Number(b.isShort);
}

export function buildLessonDrafts(files: UploadCandidate[], fallbackDate: string): BuildDraftsResult {
  const sorted = [...files].sort((a, b) => compareMediaFilenames(a.name, b.name));
  const drafts = new Map<string, LessonDraft>();
  const unsupportedIds: string[] = [];
  const images: UploadCandidate[] = [];

  for (const file of sorted) {
    const kind = mediaKindOf(file.name);
    if (kind === 'image') {
      images.push(file);
      continue;
    }
    if (kind !== 'audio') {
      unsupportedIds.push(file.id);
      continue;
    }

    const parsed = parseMediaFilename(file.name);
    const date = parsed?.date ?? fallbackDate;
    const isNamedShort = parsed?.source === 'named' && parsed.label !== '';
    const key = isNamedShort ? `short:${file.id}` : `day:${date}`;

    let draft = drafts.get(key);
    if (!draft) {
      const label = parsed
        ? parsed.label
        : file.name.replace(/\.[^.]+$/, '').replace(/[\s_-]+/g, ' ').trim();
      draft = newDraft(key, date, parsed != null, isNamedShort, label);
      drafts.set(key, draft);
    }
    draft.audio.push({
      fileId: file.id,
      name: file.name,
      size: file.size,
      durationSec: file.durationSec,
      include: true,
      audioType: null,
      tooShort: false,
      duplicateOf: null,
    });
  }

  for (const image of images) {
    const parsed = parseMediaFilename(image.name);
    const date = parsed?.date ?? fallbackDate;
    let target =
      drafts.get(`day:${date}`) ??
      [...drafts.values()].find((d) => d.isShort && d.date === date);
    if (!target) {
      target = newDraft(`day:${date}`, date, parsed != null, false, '');
      drafts.set(target.key, target);
    }
    target.images.push({ fileId: image.id, name: image.name, size: image.size, duplicateOf: null });
  }

  const result = [...drafts.values()].map(retypeParts);
  result.sort(compareDrafts);
  return { drafts: result, unsupportedIds };
}

/**
 * Add newly dropped files to the drafts already under review: same-key drafts
 * are extended (parts re-sorted in posting order), new keys are added, and
 * the list stays sorted by date.
 */
export function mergeLessonDrafts(existing: LessonDraft[], incoming: LessonDraft[]): LessonDraft[] {
  const merged = existing.map((draft) => {
    const extra = incoming.find((d) => d.key === draft.key);
    if (!extra) return draft;
    const audio = [...draft.audio, ...extra.audio].sort((a, b) => compareMediaFilenames(a.name, b.name));
    const next = retypeParts({ ...draft, audio, images: [...draft.images, ...extra.images], partsEdited: false });
    if (!draft.partsEdited) return next;
    // Keep the admin's choices for known parts; new parts get their automatic values.
    const known = new Map(draft.audio.map((p) => [p.fileId, p]));
    return { ...next, partsEdited: true, audio: next.audio.map((p) => known.get(p.fileId) ?? p) };
  });
  const keys = new Set(existing.map((d) => d.key));
  return [...merged, ...incoming.filter((d) => !keys.has(d.key))].sort(compareDrafts);
}

/** Admin picked a date: confirms it, regenerates the title, and drops the stale lookup. */
export function setDraftDate(draft: LessonDraft, date: string): LessonDraft {
  const moved = date !== draft.date;
  return retypeParts(
    withAutoTitle({
      ...draft,
      date,
      dateConfirmed: true,
      existing: moved ? null : draft.existing,
      audio: moved ? draft.audio.map((p) => ({ ...p, duplicateOf: null })) : draft.audio,
      images: moved ? draft.images.map((i) => ({ ...i, duplicateOf: null })) : draft.images,
    }),
  );
}

/**
 * Change a draft's date within the list. A daily draft moved onto a day that
 * already has an open daily draft joins it (one lesson per day); otherwise it
 * takes that day's key so later drops of that day merge into it.
 * `isOpen` tells whether a draft can still change (upload not started).
 */
export function moveDraftToDate(
  drafts: LessonDraft[],
  key: string,
  date: string,
  isOpen: (key: string) => boolean,
): LessonDraft[] {
  const draft = drafts.find((d) => d.key === key);
  if (!draft) return drafts;
  const moved = setDraftDate(draft, date);
  const dayKey = `day:${date}`;
  if (draft.isShort || !draft.key.startsWith('day:') || draft.key === dayKey) {
    return drafts.map((d) => (d.key === key ? moved : d)).sort(compareDrafts);
  }
  const rest = drafts.filter((d) => d.key !== key);
  const target = rest.find((d) => d.key === dayKey);
  if (target && !target.isShort && isOpen(dayKey)) return mergeLessonDrafts(rest, [{ ...moved, key: dayKey }]);
  return [...rest, { ...moved, key: target ? `${dayKey}#${key}` : dayKey }].sort(compareDrafts);
}

export function setDraftShort(draft: LessonDraft, isShort: boolean): LessonDraft {
  return retypeParts(
    withAutoTitle({
      ...draft,
      isShort,
      categoryId: isShort ? SHORTS_CATEGORY_ID : DAILY_CATEGORY_ID,
      partsEdited: false,
    }),
  );
}

export function setAppendToExisting(draft: LessonDraft, appendToExisting: boolean): LessonDraft {
  return retypeParts({ ...draft, appendToExisting });
}

// ==================== SERVER LOOKUP ====================

/** A dropped file as sent to the server lookup. */
export interface LookupCandidate {
  fileId: string;
  kind: 'audio' | 'image';
  date: string;
  size: number;
  name: string;
}

/** A stored lesson on one of the looked-up dates, with its media. */
export interface LookupLesson {
  id: string;
  title: string;
  date: string;
  isPublished: boolean;
  isShort: boolean;
  createdAt: string;
  audio: Array<{ size: number; name: string | null; sortOrder: number }>;
  images: Array<{ size: number; name: string | null; sortOrder: number }>;
}

export interface UploadLookup {
  /** fileId → title of the lesson that already has this file. */
  duplicates: Record<string, string>;
  /** date → the daily lesson new files of that date are appended to. */
  existingByDate: Record<string, ExistingLesson>;
}

const nextSort = (rows: Array<{ sortOrder: number }>) =>
  rows.reduce((max, row) => Math.max(max, row.sortOrder + 1), 0);

/**
 * Match dropped files against the lessons stored on their dates: a file with
 * the same byte size or original name as media of the same kind on a lesson
 * of that date is a duplicate; the earliest daily lesson of a date is the
 * append target for that date.
 */
export function matchUploadLookup(candidates: LookupCandidate[], lessons: LookupLesson[]): UploadLookup {
  const duplicates: Record<string, string> = {};
  for (const candidate of candidates) {
    const match = lessons.find(
      (lesson) =>
        lesson.date === candidate.date &&
        (candidate.kind === 'audio' ? lesson.audio : lesson.images).some(
          (media) => media.size === candidate.size || media.name === candidate.name,
        ),
    );
    if (match) duplicates[candidate.fileId] = match.title;
  }

  const existingByDate: Record<string, ExistingLesson> = {};
  const daily = lessons.filter((l) => !l.isShort).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  for (const lesson of daily) {
    if (existingByDate[lesson.date]) continue;
    existingByDate[lesson.date] = {
      id: lesson.id,
      title: lesson.title,
      isPublished: lesson.isPublished,
      audioCount: lesson.audio.length,
      nextAudioSort: nextSort(lesson.audio),
      nextImageSort: nextSort(lesson.images),
    };
  }
  return { duplicates, existingByDate };
}

/** Files of a draft to send to the server lookup. */
export function lookupCandidates(draft: LessonDraft): LookupCandidate[] {
  return [
    ...draft.audio.map((p) => ({ fileId: p.fileId, kind: 'audio' as const, date: draft.date, size: p.size, name: p.name })),
    ...draft.images.map((i) => ({ fileId: i.fileId, kind: 'image' as const, date: draft.date, size: i.size, name: i.name })),
  ];
}

/** Apply the server lookup: mark stored files as duplicates and pick the append target. */
export function applyUploadLookup(draft: LessonDraft, lookup: UploadLookup): LessonDraft {
  return retypeParts({
    ...draft,
    existing: lookup.existingByDate[draft.date] ?? null,
    audio: draft.audio.map((p) => ({ ...p, duplicateOf: lookup.duplicates[p.fileId] ?? null })),
    images: draft.images.map((i) => ({ ...i, duplicateOf: lookup.duplicates[i.fileId] ?? null })),
  });
}

// ==================== UPLOAD PLAN ====================

/** Parts that will be uploaded, with their final sort order on the target lesson. */
export function includedParts(draft: LessonDraft): Array<DraftAudioPart & { sortOrder: number }> {
  const base = appendTarget(draft)?.nextAudioSort ?? 0;
  return draft.audio.filter((p) => p.include).map((p, i) => ({ ...p, sortOrder: base + i }));
}

/** Images that will be uploaded (duplicates skipped), with their final sort order. */
export function includedImages(draft: LessonDraft): Array<DraftImage & { sortOrder: number }> {
  const base = appendTarget(draft)?.nextImageSort ?? 0;
  return draft.images.filter((i) => !i.duplicateOf).map((i, index) => ({ ...i, sortOrder: base + index }));
}

export type DraftAttention = 'noDate' | 'noAudio';

export type DraftState =
  | { kind: 'ready' }
  /** Blocks the batch until the admin fixes or excludes the draft. */
  | { kind: 'attention'; reason: DraftAttention }
  /** Everything in it is already stored; nothing to upload. */
  | { kind: 'skip' }
  | { kind: 'excluded' };

export function draftState(draft: LessonDraft): DraftState {
  if (draft.excluded) return { kind: 'excluded' };
  const parts = includedParts(draft).length;
  const images = includedImages(draft).length;
  const hasDuplicates = draft.audio.some((p) => p.duplicateOf) || draft.images.some((i) => i.duplicateOf);
  if (parts === 0 && images === 0 && hasDuplicates) return { kind: 'skip' };
  if (!draft.dateFromFilename && !draft.dateConfirmed) return { kind: 'attention', reason: 'noDate' };
  // A new lesson needs audio; an existing one can take images alone.
  if (parts === 0 && !(appendTarget(draft) && images > 0)) return { kind: 'attention', reason: 'noAudio' };
  return { kind: 'ready' };
}

export interface DraftSummary {
  /** Daily lessons to create or extend. */
  lessons: number;
  shorts: number;
  recordings: number;
  images: number;
  /** Files already stored in the DB, skipped. */
  duplicates: number;
  /** Files whose date was guessed and still needs confirming. */
  undated: number;
  /** Clips under two minutes left unchecked. */
  tinyClips: number;
}

export function summarizeDrafts(drafts: LessonDraft[]): DraftSummary {
  const summary: DraftSummary = {
    lessons: 0, shorts: 0, recordings: 0, images: 0, duplicates: 0, undated: 0, tinyClips: 0,
  };
  for (const draft of drafts) {
    if (draft.excluded) continue;
    const state = draftState(draft);
    summary.duplicates +=
      draft.audio.filter((p) => p.duplicateOf).length + draft.images.filter((i) => i.duplicateOf).length;
    summary.tinyClips += draft.audio.filter((p) => p.tooShort && !p.include).length;
    if (state.kind === 'skip') continue;
    if (!draft.dateFromFilename && !draft.dateConfirmed) summary.undated += draft.audio.length + draft.images.length;
    if (draft.isShort) summary.shorts++;
    else summary.lessons++;
    summary.recordings += includedParts(draft).length;
    summary.images += includedImages(draft).length;
  }
  return summary;
}

export interface DraftLessonFields {
  title: string;
  hebrew_title: string;
  date: string;
  hebrew_date: string;
  parsha: string | null;
  teacher: string;
  location: string;
  lesson_type: string;
  category_id: string | null;
  description?: string;
  tags?: string[];
}

export function lessonFieldsForDraft(draft: LessonDraft): DraftLessonFields {
  const meta = generateLessonMetadata(draft.date);
  const title = draft.title.trim() || titleFor(draft);
  const description = draft.description.trim();
  return {
    title,
    hebrew_title: title,
    date: draft.date,
    hebrew_date: meta.hebrewDate,
    parsha: meta.parsha,
    teacher: meta.teacher,
    location: meta.location,
    lesson_type: draft.isShort ? SHORT_LESSON_TYPE : meta.lessonType,
    category_id: draft.categoryId || null,
    ...(description ? { description } : {}),
    tags: normalizeTags(draft.tags),
  };
}
