/**
 * Turns a batch of dropped media files into lesson drafts for the admin
 * daily upload. Pure: no DOM, no network, so the grouping rules are testable.
 *
 * Rules:
 * - WhatsApp / recorder files are grouped by the calendar date in their name
 *   (a 00:30 file belongs to that date, never to the previous day).
 * - Human-named files that carry a date and a topic ("אליהו 29.01.2026 נושא.mp3")
 *   are short lessons, one draft per file, titled by the topic.
 * - Files without a detectable date use the fallback date (today in Jerusalem).
 * - Daily parts are typed by posting order: 1st סידור, 2nd עץ חיים. Clips under
 *   two minutes are flagged and left out by default.
 * - Images join the daily draft of their date (or a short of that date).
 */
import { generateLessonMetadata } from '@/lib/hebrew-date';
import {
  compareMediaFilenames,
  LESSON_PART_TYPES,
  mediaKindOf,
  parseMediaFilename,
  SHORTS_AUDIO_TYPE,
} from '@/lib/lesson-naming';

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

export interface LessonDraft {
  key: string;
  date: string;
  /** False when the date came from the fallback (no date in any filename). */
  dateFromFilename: boolean;
  isShort: boolean;
  title: string;
  /** Admin typed the title; stop regenerating it. */
  titleEdited: boolean;
  /** Admin changed part inclusion/types; stop re-assigning them. */
  partsEdited: boolean;
  /** Topic from the filename, used as the short-lesson title. */
  label: string;
  categoryId: string;
  audio: DraftAudioPart[];
  imageIds: string[];
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

/** Auto title: topic label for shorts, "יום X - <hebrew date>" for daily lessons. */
function titleFor(draft: Pick<LessonDraft, 'isShort' | 'label' | 'date'>): string {
  const meta = generateLessonMetadata(draft.date);
  if (draft.isShort) return draft.label || `שיעור קצר - ${meta.hebrewDate}`;
  return meta.title;
}

/** Recompute include/type/tooShort from durations, posting order and duplicates. */
export function assignParts(audio: DraftAudioPart[], isShort: boolean): DraftAudioPart[] {
  let position = 0;
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

function newDraft(key: string, date: string, dateFromFilename: boolean, isShort: boolean, label: string): LessonDraft {
  const draft: LessonDraft = {
    key,
    date,
    dateFromFilename,
    isShort,
    title: '',
    titleEdited: false,
    partsEdited: false,
    label,
    categoryId: isShort ? SHORTS_CATEGORY_ID : DAILY_CATEGORY_ID,
    audio: [],
    imageIds: [],
  };
  draft.title = titleFor(draft);
  return draft;
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
    target.imageIds.push(image.id);
  }

  const result = [...drafts.values()].map((d) => ({ ...d, audio: assignParts(d.audio, d.isShort) }));
  result.sort((a, b) => (a.date === b.date ? Number(a.isShort) - Number(b.isShort) : a.date < b.date ? -1 : 1));
  return { drafts: result, unsupportedIds };
}

/**
 * Add newly dropped files to the drafts already under review: same-key drafts
 * are extended (parts re-sorted in posting order), new keys are appended.
 */
export function mergeLessonDrafts(existing: LessonDraft[], incoming: LessonDraft[]): LessonDraft[] {
  const merged = existing.map((draft) => {
    const extra = incoming.find((d) => d.key === draft.key);
    if (!extra) return draft;
    const audio = [...draft.audio, ...extra.audio].sort((a, b) => compareMediaFilenames(a.name, b.name));
    const known = new Map(draft.audio.map((p) => [p.fileId, p]));
    const assigned = assignParts(audio, draft.isShort);
    return {
      ...draft,
      audio: draft.partsEdited ? assigned.map((p) => known.get(p.fileId) ?? p) : assigned,
      imageIds: [...draft.imageIds, ...extra.imageIds],
    };
  });
  const keys = new Set(existing.map((d) => d.key));
  return [...merged, ...incoming.filter((d) => !keys.has(d.key))];
}

export function setDraftDate(draft: LessonDraft, date: string): LessonDraft {
  const next = { ...draft, date };
  return { ...next, title: draft.titleEdited ? draft.title : titleFor(next) };
}

export function setDraftShort(draft: LessonDraft, isShort: boolean): LessonDraft {
  const next = {
    ...draft,
    isShort,
    categoryId: isShort ? SHORTS_CATEGORY_ID : DAILY_CATEGORY_ID,
    audio: assignParts(draft.audio, isShort),
    partsEdited: false,
  };
  return { ...next, title: draft.titleEdited ? draft.title : titleFor(next) };
}

/** Mark parts that already exist in the DB; they are excluded from upload. */
export function applyDuplicates(draft: LessonDraft, duplicates: Record<string, string>): LessonDraft {
  const audio = draft.audio.map((p) => ({ ...p, duplicateOf: duplicates[p.fileId] ?? null }));
  if (!draft.partsEdited) return { ...draft, audio: assignParts(audio, draft.isShort) };
  return {
    ...draft,
    audio: audio.map((p) => (p.duplicateOf ? { ...p, include: false } : p)),
  };
}

/** Parts that will be uploaded, with their final sort order. */
export function includedParts(draft: LessonDraft): Array<DraftAudioPart & { sortOrder: number }> {
  return draft.audio.filter((p) => p.include).map((p, sortOrder) => ({ ...p, sortOrder }));
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
}

export function lessonFieldsForDraft(draft: LessonDraft, description = ''): DraftLessonFields {
  const meta = generateLessonMetadata(draft.date);
  const title = draft.title.trim() || titleFor(draft);
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
    ...(description.trim() ? { description: description.trim() } : {}),
  };
}
