import 'server-only';
import { createTranslator } from 'next-intl';
import heMessages from '../../../messages/he.json';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { sendNewLessonEmails } from '@/lib/notifications/email';
import { loadAllPushSubscriptions, sendPush } from '@/lib/notifications/push';

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
    const { data: lesson, error } = await createAdminSupabaseClient()
      .from('lessons')
      .update({ notified_at: new Date().toISOString() })
      .eq('id', lessonId)
      .eq('is_published', true)
      .is('notified_at', null)
      .select('id, title, hebrew_title')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!lesson) return; // draft, deleted, or already announced

    const title: string = lesson.hebrew_title || lesson.title;
    const t = createTranslator({ locale: 'he', messages: heMessages, namespace: 'notifications.push' });

    const [push, email] = await Promise.all([
      loadAllPushSubscriptions()
        .then((subscriptions) =>
          sendPush(subscriptions, {
            title: t('newLessonTitle'),
            body: title,
            url: `/he/lessons/${lesson.id}`,
            tag: `lesson-${lesson.id}`,
          }),
        )
        .catch((err) => {
          console.error('[notify] push failed:', err);
          return null;
        }),
      sendNewLessonEmails({ id: lesson.id, title }),
    ]);
    console.info('[notify] lesson', lesson.id, { push, emailsSent: email.sent });
  } catch (err) {
    console.error('[notify] notifyNewLesson failed for', lessonId, err);
  }
}
