import 'server-only';
import { createTranslator } from 'next-intl';
import heMessages from '../../../messages/he.json';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { sendNewLessonEmails, sendNewLessonsDigestEmails } from '@/lib/notifications/email';
import { loadAllPushSubscriptions, sendPush, type PushPayload } from '@/lib/notifications/push';
import { summarizeBatch, type AnnouncedLesson, type NotifyMode } from '@/lib/notifications/batch-rules';
import { SHORT_LESSON_TYPE, SHORTS_CATEGORY_ID } from '@/lib/upload-drafts';
import { lessonPath, localePath } from '@/config/site';

const CLAIMED_COLUMNS = 'id, title, hebrew_title, date, hebrew_date, lesson_type, category_id';

interface ClaimedRow {
  id: string;
  title: string;
  hebrew_title: string | null;
  date: string;
  hebrew_date: string | null;
  lesson_type: string | null;
  category_id: string | null;
}

function toAnnounced(row: ClaimedRow): AnnouncedLesson {
  return {
    id: row.id,
    title: row.hebrew_title || row.title,
    date: row.date,
    hebrewDate: row.hebrew_date,
    isShort: row.lesson_type === SHORT_LESSON_TYPE || row.category_id === SHORTS_CATEGORY_ID,
  };
}

function pushToAll(payload: PushPayload) {
  return loadAllPushSubscriptions()
    .then((subscriptions) => sendPush(subscriptions, payload))
    .catch((err) => {
      console.error('[notify] push failed:', err);
      return null;
    });
}

async function announceLesson(lesson: AnnouncedLesson): Promise<void> {
  const t = createTranslator({ locale: 'he', messages: heMessages, namespace: 'notifications.push' });
  const [push, email] = await Promise.all([
    pushToAll({
      title: t('newLessonTitle'),
      body: lesson.title,
      url: localePath(lessonPath(lesson.id)),
      tag: `lesson-${lesson.id}`,
    }),
    sendNewLessonEmails({ id: lesson.id, title: lesson.title }),
  ]);
  console.info('[notify] lesson', lesson.id, { push, emailsSent: email.sent });
}

/**
 * Announces a newly published lesson by Web Push (every subscribed device) and
 * email (opted-in users, when SMTP is configured).
 *
 * Idempotent: the lesson is claimed atomically (is_published AND notified_at
 * IS NULL → notified_at = now()), so drafts, repeat publishes, double clicks
 * and retries never notify twice. Never throws; failures are logged.
 */
export async function notifyNewLesson(lessonId: string): Promise<void> {
  try {
    const { data, error } = await createAdminSupabaseClient()
      .from('lessons')
      .update({ notified_at: new Date().toISOString() })
      .eq('id', lessonId)
      .eq('is_published', true)
      .is('notified_at', null)
      .select(CLAIMED_COLUMNS)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return; // draft, deleted, or already announced
    await announceLesson(toAnnounced(data as ClaimedRow));
  } catch (err) {
    console.error('[notify] notifyNewLesson failed for', lessonId, err);
  }
}

/**
 * Announces lessons published together (one upload batch):
 * - 'each': every lesson gets its own notification (notifyNewLesson).
 * - 'summary': ONE push ("N שיעורים חדשים עלו" + date range, opens the newest
 *   lesson) and ONE email listing them; a single lesson is announced normally.
 * - 'none': nothing is sent.
 * Every published, not yet announced lesson is claimed (notified_at) in all
 * modes, so later publishes/edits never re-announce it. Never throws.
 */
export async function notifyNewLessons(lessonIds: string[], mode: NotifyMode): Promise<void> {
  try {
    const ids = [...new Set(lessonIds)];
    if (ids.length === 0) return;
    if (mode === 'each') {
      for (const id of ids) await notifyNewLesson(id);
      return;
    }

    const { data, error } = await createAdminSupabaseClient()
      .from('lessons')
      .update({ notified_at: new Date().toISOString() })
      .in('id', ids)
      .eq('is_published', true)
      .is('notified_at', null)
      .select(CLAIMED_COLUMNS);
    if (error) throw new Error(error.message);
    const claimed = ((data ?? []) as ClaimedRow[]).map(toAnnounced);
    if (mode === 'none' || claimed.length === 0) {
      console.info('[notify] batch claimed without sending', { mode, claimed: claimed.length });
      return;
    }
    if (claimed.length === 1) {
      await announceLesson(claimed[0]);
      return;
    }

    const summary = summarizeBatch(claimed)!;
    const t = createTranslator({ locale: 'he', messages: heMessages, namespace: 'notifications.batch' });
    const dateLabel = (lesson: AnnouncedLesson) => lesson.hebrewDate || lesson.date.split('-').reverse().join('.');
    const range =
      summary.first.date === summary.last.date
        ? dateLabel(summary.first)
        : t('range', { from: dateLabel(summary.first), to: dateLabel(summary.last) });

    const [push, email] = await Promise.all([
      pushToAll({
        title: t('title', { count: summary.count }),
        body: range,
        url: localePath(lessonPath(summary.newest.id)),
        tag: `lessons-batch-${summary.newest.id}`,
      }),
      sendNewLessonsDigestEmails({
        count: summary.count,
        range,
        lessons: summary.lessons.map((lesson) => ({ ...lesson, dateLabel: dateLabel(lesson) })),
      }),
    ]);
    console.info('[notify] batch', summary.lessons.map((l) => l.id), { push, emailsSent: email.sent });
  } catch (err) {
    console.error('[notify] notifyNewLessons failed for', lessonIds, err);
  }
}
