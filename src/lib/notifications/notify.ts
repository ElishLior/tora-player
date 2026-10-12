import 'server-only';
import { createTranslator } from 'next-intl';
import heMessages from '../../../messages/he.json';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { isEmailConfigured, sendAnnouncementEmails } from '@/lib/notifications/email';
import { loadAllPushSubscriptions, sendPush, type PushResult, type StoredPushSubscription } from '@/lib/notifications/push';
import { deliveredPushUserIds } from '@/lib/notifications/recipients';
import {
  planAnnouncement,
  renderAnnouncement,
  type AnnouncedPart,
  type AnnouncementContent,
  type AnnouncementItem,
} from '@/lib/notifications/announcement';
import type { AnnouncedLesson, NotifyMode } from '@/lib/notifications/batch-rules';
import { SHORT_LESSON_TYPE, SHORTS_CATEGORY_ID } from '@/lib/upload-drafts';
import { withLessonSlugSelect } from '@/lib/supabase/lesson-slug-select';

const LESSON_COLUMNS = 'id, slug, title, hebrew_title, date, hebrew_date, lesson_type, category_id';

interface LessonRow {
  id: string;
  slug?: string | null;
  title: string;
  hebrew_title: string | null;
  date: string;
  hebrew_date: string | null;
  lesson_type: string | null;
  category_id: string | null;
}

interface PartRow {
  id: string;
  lesson_id: string;
  sort_order: number | null;
  duration: number | null;
}

function toAnnounced(row: LessonRow): AnnouncedLesson {
  return {
    id: row.id,
    slug: row.slug,
    title: row.hebrew_title || row.title,
    date: row.date,
    hebrewDate: row.hebrew_date,
    isShort: row.lesson_type === SHORT_LESSON_TYPE || row.category_id === SHORTS_CATEGORY_ID,
  };
}

const toPart = (row: PartRow): AnnouncedPart => ({
  id: row.id,
  lessonId: row.lesson_id,
  sortOrder: row.sort_order ?? 0,
  duration: row.duration,
});

/** lesson_audio.notified_at arrives with migration 022; before it, parts are not tracked. */
function isMissingPartNotifiedAt(error: { code?: string; message?: string }): boolean {
  return ['42703', 'PGRST204'].includes(error.code ?? '') && /notified_at/i.test(error.message ?? '');
}

/**
 * Claims what these lessons have that was never announced, atomically, so a
 * retry, a double click or a second call claims nothing twice. Two claims:
 * - lessons: is_published AND notified_at IS NULL → now();
 * - parts: lesson_audio.notified_at IS NULL → now().
 * With `addedParts` (upload batches) the parts of every published lesson are
 * claimed first, so a part added to a lesson announced earlier is announced as
 * "added". Parts go first there: if claiming the lesson then fails, the worst
 * case is a missed "added parts" line, never the same parts announced twice later.
 * Without it (edit and publish) the lessons are claimed first and only the parts
 * of lessons claimed right now. Edit/publish never announces added parts; when no
 * lesson was claimed it still stamps the parts of the published lessons, so a
 * later upload doesn't announce them either (and nothing is announced now).
 */
async function claimAnnouncement(lessonIds: string[], { addedParts }: { addedParts: boolean }) {
  const supabase = createAdminSupabaseClient();
  const now = new Date().toISOString();

  const claimParts = async (lessonIdsToClaim: string[]): Promise<PartRow[]> => {
    const partClaim = await supabase
      .from('lesson_audio')
      .update({ notified_at: now })
      .in('lesson_id', lessonIdsToClaim)
      .is('notified_at', null)
      .select('id, lesson_id, sort_order, duration');
    if (partClaim.error) {
      if (!isMissingPartNotifiedAt(partClaim.error)) throw new Error(partClaim.error.message);
      console.info('[notify] lesson_audio.notified_at missing (migration 022); parts are not tracked');
      return [];
    }
    return (partClaim.data ?? []) as PartRow[];
  };

  const claimLessons = async (lessonIdsToClaim: string[]): Promise<string[]> => {
    const lessonClaim = await supabase
      .from('lessons')
      .update({ notified_at: now })
      .in('id', lessonIdsToClaim)
      .eq('is_published', true)
      .is('notified_at', null)
      .select('id');
    if (lessonClaim.error) throw new Error(lessonClaim.error.message);
    return ((lessonClaim.data ?? []) as { id: string }[]).map((row) => row.id);
  };

  const published = await withLessonSlugSelect(LESSON_COLUMNS, (columns) =>
    supabase
      .from('lessons')
      .select(columns)
      .in('id', lessonIds)
      .eq('is_published', true)
      .overrideTypes<LessonRow[], { merge: false }>(),
  );
  if (published.error) throw new Error(published.error.message);
  const lessons = ((published.data ?? []) as LessonRow[]).map(toAnnounced);
  if (lessons.length === 0) return null;
  const publishedIds = lessons.map((lesson) => lesson.id);

  let claimedParts: PartRow[];
  let claimedLessonIds: string[];
  if (addedParts) {
    claimedParts = await claimParts(publishedIds);
    claimedLessonIds = await claimLessons(publishedIds);
  } else {
    claimedLessonIds = await claimLessons(publishedIds);
    if (claimedLessonIds.length === 0) {
      // Nothing new to announce: stamp the parts anyway so an upload never announces them.
      await claimParts(publishedIds);
      return null;
    }
    claimedParts = await claimParts(claimedLessonIds);
  }

  // Every part of the lessons involved, for part lines and real part numbers.
  const involved = [...new Set([...claimedLessonIds, ...claimedParts.map((part) => part.lesson_id)])];
  let parts = claimedParts.map(toPart);
  if (involved.length > 0) {
    const all = await supabase
      .from('lesson_audio')
      .select('id, lesson_id, sort_order, duration')
      .in('lesson_id', involved);
    if (all.error) console.error('[notify] reading lesson parts failed; using the claimed parts only:', all.error);
    else parts = ((all.data ?? []) as PartRow[]).map(toPart);
  }

  return {
    lessons,
    claimedLessonIds,
    claimedPartIds: claimedParts.map((part) => part.id),
    parts,
  };
}

/** Emails of the users behind delivered pushes; a failed lookup keeps that user's email. */
async function emailsOfUsers(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0 || !isEmailConfigured()) return [];
  const supabase = createAdminSupabaseClient();
  const found = await Promise.all(
    userIds.map(async (id) => {
      try {
        const { data, error } = await supabase.auth.admin.getUserById(id);
        if (error) throw error;
        return data.user?.email ?? null;
      } catch (err) {
        console.error('[notify] user lookup failed; their email is still sent:', id, err);
        return null;
      }
    }),
  );
  return found.filter((email): email is string => Boolean(email));
}

/**
 * One announcement, each person reached once: push first (every subscribed
 * device), then email to opted-in users whose push did not arrive on any of
 * their devices.
 */
async function deliver(content: AnnouncementContent): Promise<void> {
  let subscriptions: StoredPushSubscription[] = [];
  try {
    subscriptions = await loadAllPushSubscriptions();
  } catch (err) {
    console.error('[notify] loading push subscriptions failed:', err);
  }
  const push: PushResult =
    subscriptions.length > 0
      ? await sendPush(subscriptions, content.push)
      : { sent: 0, expired: 0, failed: 0, deliveredIds: [] };
  const pushedEmails = await emailsOfUsers(deliveredPushUserIds(subscriptions, push.deliveredIds));
  const email = await sendAnnouncementEmails(content.email, pushedEmails);
  console.info('[notify] announced', content.push.tag, {
    push: { sent: push.sent, expired: push.expired, failed: push.failed },
    emailsSent: email.sent,
    emailsSkippedForPush: email.skippedForPush,
  });
}

/**
 * Announces new content of these lessons, once:
 * - 'summary' (default): ONE push + ONE email for everything claimed. One
 *   new lesson reads "שיעור חדש עלה" + title + its parts; several are
 *   "N שיעורים חדשים עלו" + date range, opening the newest lesson.
 * - 'each': the same items, one notification per lesson.
 * - 'none': nothing is sent.
 *
 * Rule: "added part" lines ("נוסף חלק חדש" for a lesson announced earlier)
 * come ONLY from upload batches, which call this with the default
 * `addedParts: true`. Edit and publish call notifyNewLesson, which passes
 * `addedParts: false`: it announces a lesson only the first time, with its
 * parts, and never announces parts added to it later (see claimAnnouncement).
 * Edit/publish never announces added parts; it stamps them so a later upload
 * doesn't announce them either.
 *
 * Everything claimed is claimed once, so retries, double clicks and later
 * edits never announce it again; nothing claimed means nothing sent.
 * Never throws.
 */
export async function notifyNewLessons(
  lessonIds: string[],
  mode: NotifyMode,
  options: { addedParts?: boolean } = {},
): Promise<void> {
  try {
    const ids = [...new Set(lessonIds)];
    if (ids.length === 0) return;
    const claimed = await claimAnnouncement(ids, { addedParts: options.addedParts ?? true });
    if (!claimed) return;
    if (mode === 'none') {
      console.info('[notify] claimed without sending', {
        lessons: claimed.claimedLessonIds.length,
        parts: claimed.claimedPartIds.length,
      });
      return;
    }

    const tParts = createTranslator({ locale: 'he', messages: heMessages, namespace: 'partDurations' });
    const t = createTranslator({ locale: 'he', messages: heMessages, namespace: 'notifications' });
    const items = planAnnouncement(claimed, tParts);
    const groups: AnnouncementItem[][] = mode === 'each' ? items.map((item) => [item]) : [items];
    for (const group of groups) {
      const content = renderAnnouncement(group, t);
      if (content) await deliver(content);
    }
  } catch (err) {
    console.error('[notify] notifyNewLessons failed for', lessonIds, err);
  }
}

/**
 * One lesson published or saved on the edit page (not an upload batch): announced
 * as a one-lesson summary only if it was never announced before. Parts added to
 * an already announced lesson are NOT announced here (addedParts: false). Never throws.
 */
export function notifyNewLesson(lessonId: string): Promise<void> {
  return notifyNewLessons([lessonId], 'summary', { addedParts: false });
}
