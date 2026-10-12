/**
 * What one new-content announcement says. Pure (no database, no sending), so
 * the wording and numbering are tested here and notify.ts only claims rows and
 * delivers.
 *
 * An announcement covers what one call claimed:
 * - a "lesson" item for each lesson announced for the first time, with every
 *   one of its parts ("חלק 1: 82 דק׳ · חלק 2: 70 דק׳");
 * - a "parts" item for each lesson announced earlier that got new parts, with
 *   only those parts, numbered by their real place in the lesson.
 * One item reads like a single-lesson notification; several make one summary.
 */
import type { createTranslator } from 'next-intl';
import type heMessages from '../../../messages/he.json';
import { lessonPath, lessonUrl, localePath, pageUrl } from '@/config/site';
import { formatPartDurations, PART_SEPARATOR, type PartDurationsTranslator } from '@/lib/part-durations';
import { summarizeBatch, type AnnouncedLesson } from '@/lib/notifications/batch-rules';

/** next-intl translator over the Hebrew messages, scoped to the `notifications` namespace. */
export type NotificationsTranslator = ReturnType<typeof createTranslator<typeof heMessages, 'notifications'>>;

export interface AnnouncedPart {
  id: string;
  lessonId: string;
  sortOrder: number;
  /** Seconds; 0 or null when unknown. */
  duration: number | null;
}

export interface AnnouncementItem {
  kind: 'lesson' | 'parts';
  lesson: AnnouncedLesson;
  /** Claimed part ids ('parts' items) or every part id ('lesson' items), in play order. */
  partIds: string[];
  /** Part labels for the item, e.g. ["חלק 3: 40 דק׳"]. Empty when lengths are unknown. */
  partLabels: string[];
}

/** Play order, matching getSortedAudioFiles (src/lib/lesson-tracks.ts). */
function playOrder(a: AnnouncedPart, b: AnnouncedPart): number {
  return a.sortOrder - b.sortOrder || a.id.localeCompare(b.id);
}

/**
 * Splits what was claimed into announcement items, oldest lesson first (daily
 * lessons before shorts of the same day). `lessons` must include every lesson
 * that was claimed or got a claimed part; `parts` every part of those lessons.
 */
export function planAnnouncement(
  input: {
    lessons: readonly AnnouncedLesson[];
    claimedLessonIds: readonly string[];
    claimedPartIds: readonly string[];
    parts: readonly AnnouncedPart[];
  },
  tParts: PartDurationsTranslator,
): AnnouncementItem[] {
  const claimedLessons = new Set(input.claimedLessonIds);
  const claimedParts = new Set(input.claimedPartIds);
  const items: AnnouncementItem[] = [];

  for (const lesson of input.lessons) {
    const lessonParts = input.parts.filter((part) => part.lessonId === lesson.id).sort(playOrder);
    const labels = formatPartDurations(
      lessonParts.map((part) => part.duration ?? 0),
      tParts,
    );
    if (claimedLessons.has(lesson.id)) {
      items.push({ kind: 'lesson', lesson, partIds: lessonParts.map((p) => p.id), partLabels: labels });
      continue;
    }
    const added = lessonParts.flatMap((part, index) => (claimedParts.has(part.id) ? [{ part, index }] : []));
    if (added.length === 0) continue;
    items.push({
      kind: 'parts',
      lesson,
      partIds: added.map(({ part }) => part.id),
      // A single part total has a length-only label; an unknown length has none.
      partLabels: added.flatMap(({ index }) => (labels[index] ? [labels[index]] : [])),
    });
  }

  const ordered = summarizeBatch(items.map((item) => item.lesson))?.lessons ?? [];
  return ordered.map((lesson) => items.find((item) => item.lesson.id === lesson.id)!);
}

export interface AnnouncementContent {
  push: { title: string; body: string; url: string; tag: string };
  email: {
    subject: string;
    heading: string;
    /** Lines above the list (date range, added-parts note); empty for one item. */
    intro: string[];
    items: Array<{ title: string; url: string; dateLabel: string; detail: string | null }>;
    cta: { label: string; url: string };
  };
}

/** Titles listed in a multi-lesson push body, and their length cap (longer ones end in "…"). */
const PUSH_TITLE_LIMIT = 3;
const PUSH_TITLE_MAX_CHARS = 60;
const shortTitle = (title: string) =>
  title.length > PUSH_TITLE_MAX_CHARS ? `${title.slice(0, PUSH_TITLE_MAX_CHARS - 1)}…` : title;

const dateLabel = (lesson: AnnouncedLesson) => lesson.hebrewDate || lesson.date.split('-').reverse().join('.');
const partLine = (item: AnnouncementItem) => item.partLabels.join(PART_SEPARATOR);

/** Push and email content for the items of one announcement; null when there is nothing to say. */
export function renderAnnouncement(
  items: readonly AnnouncementItem[],
  t: NotificationsTranslator,
): AnnouncementContent | null {
  if (items.length === 0) return null;

  const emailItems = items.map((item) => {
    const line = partLine(item);
    const detail =
      item.kind === 'lesson'
        ? line || null
        : line
          ? t('batch.addedParts', { parts: line })
          : t('push.partsAddedTitle', { count: item.partIds.length });
    return { title: item.lesson.title, url: lessonUrl(item.lesson), dateLabel: dateLabel(item.lesson), detail };
  });
  // Unique per announcement: a lesson or part is claimed only once.
  const claimKey = items[0].kind === 'lesson' ? items[0].lesson.id : items[0].partIds[0];

  if (items.length === 1) {
    const [item] = items;
    const title =
      item.kind === 'lesson' ? t('push.newLessonTitle') : t('push.partsAddedTitle', { count: item.partIds.length });
    const line = partLine(item);
    return {
      push: {
        title,
        body: line ? `${item.lesson.title}\n${line}` : item.lesson.title,
        url: localePath(lessonPath(item.lesson)),
        tag: item.kind === 'lesson' ? `lesson-${item.lesson.id}` : `lesson-parts-${claimKey}`,
      },
      email: {
        subject:
          item.kind === 'lesson'
            ? t('email.subject', { title: item.lesson.title })
            : t('email.partsSubject', { count: item.partIds.length, title: item.lesson.title }),
        heading: item.kind === 'lesson' ? t('email.heading') : title,
        intro: [],
        items: emailItems,
        cta: { label: t('email.cta'), url: lessonUrl(item.lesson) },
      },
    };
  }

  const summary = summarizeBatch(items.map((item) => item.lesson))!;
  const newCount = items.filter((item) => item.kind === 'lesson').length;
  const partsLessons = items.length - newCount;
  const title = newCount > 0 ? t('batch.title', { count: newCount }) : t('batch.partsLessons', { count: partsLessons });
  const range =
    summary.first.date === summary.last.date
      ? dateLabel(summary.first)
      : t('batch.range', { from: dateLabel(summary.first), to: dateLabel(summary.last) });
  const intro = newCount > 0 && partsLessons > 0 ? [range, t('batch.partsLessons', { count: partsLessons })] : [range];

  // Push body: the date range, the first titles (oldest first), then how many are left.
  const titles = summary.lessons.slice(0, PUSH_TITLE_LIMIT).map((lesson) => shortTitle(lesson.title));
  const more = summary.count - titles.length;
  const pushBody = [range, ...titles, ...(more > 0 ? [t('batch.more', { count: more })] : [])];

  return {
    push: {
      title,
      body: pushBody.join('\n'),
      url: localePath(lessonPath(summary.newest)),
      tag: `lessons-batch-${claimKey}`,
    },
    email: {
      subject: title,
      heading: title,
      intro,
      items: emailItems,
      cta: { label: t('batch.emailCta'), url: pageUrl('/lessons') },
    },
  };
}
