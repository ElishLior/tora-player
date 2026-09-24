import 'server-only';
import { createTranslator } from 'next-intl';
import heMessages from '../../../messages/he.json';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

const RESEND_BATCH_URL = 'https://api.resend.com/emails/batch';
const RESEND_BATCH_LIMIT = 100;

export function isEmailConfigured(env: Partial<Record<string, string | undefined>> = process.env): boolean {
  return Boolean(env.RESEND_API_KEY && env.NOTIFY_FROM_EMAIL && env.NEXT_PUBLIC_APP_URL);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function countEmailRecipients(): Promise<number> {
  const { data, error } = await createAdminSupabaseClient().rpc('new_lesson_email_recipients');
  if (error) throw new Error(error.message);
  return (data ?? []).length;
}

/**
 * Emails every confirmed user with profiles.notify_new_lessons = true via
 * Resend's batch API. Skipped (with a log line) unless RESEND_API_KEY,
 * NOTIFY_FROM_EMAIL and NEXT_PUBLIC_APP_URL are set. Never throws.
 */
export async function sendNewLessonEmails(lesson: { id: string; title: string }): Promise<{ sent: number }> {
  if (!isEmailConfigured()) return { sent: 0 };

  try {
    const { data: recipients, error } = await createAdminSupabaseClient().rpc('new_lesson_email_recipients');
    if (error) throw new Error(error.message);
    const list = (recipients ?? []) as { email: string; display_name: string | null }[];
    if (list.length === 0) return { sent: 0 };

    const t = createTranslator({ locale: 'he', messages: heMessages, namespace: 'notifications.email' });
    const appUrl = process.env.NEXT_PUBLIC_APP_URL!.replace(/\/$/, '');
    const lessonUrl = `${appUrl}/he/lessons/${lesson.id}`;
    const accountUrl = `${appUrl}/he/auth/account`;
    const title = escapeHtml(lesson.title);
    const html = `<!doctype html>
<html lang="he" dir="rtl">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;direction:rtl;text-align:right;color:#18181b">
<div style="max-width:480px;margin:0 auto;padding:24px">
<p style="margin:0 0 8px;font-size:13px;color:#71717a">${escapeHtml(t('appName'))}</p>
<h1 style="margin:0 0 12px;font-size:20px">${escapeHtml(t('heading'))}</h1>
<p style="margin:0 0 20px;font-size:17px"><bdi>${title}</bdi></p>
<p style="margin:0 0 24px"><a href="${lessonUrl}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:15px">${escapeHtml(t('cta'))}</a></p>
<p style="margin:0;font-size:12px;color:#71717a">${escapeHtml(t('footer'))} <a href="${accountUrl}" style="color:#52525b">${escapeHtml(t('manage'))}</a></p>
</div>
</body>
</html>`;
    const text = `${t('heading')}\n${lesson.title}\n\n${t('cta')}: ${lessonUrl}\n\n${t('footer')} ${accountUrl}`;
    const subject = t('subject', { title: lesson.title });

    let sent = 0;
    for (let i = 0; i < list.length; i += RESEND_BATCH_LIMIT) {
      const batch = list.slice(i, i + RESEND_BATCH_LIMIT).map((recipient) => ({
        from: process.env.NOTIFY_FROM_EMAIL!,
        to: [recipient.email],
        subject,
        html,
        text,
        headers: { 'List-Unsubscribe': `<${accountUrl}>` },
      }));
      const response = await fetch(RESEND_BATCH_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
          // Resend dedupes retries of the same batch for 24h.
          'Idempotency-Key': `new-lesson-${lesson.id}-${i / RESEND_BATCH_LIMIT}`,
        },
        body: JSON.stringify(batch),
      });
      if (!response.ok) {
        console.error('[email] Resend batch failed:', response.status, await response.text().catch(() => ''));
        continue;
      }
      sent += batch.length;
    }
    return { sent };
  } catch (err) {
    console.error('[email] new-lesson emails failed:', err);
    return { sent: 0 };
  }
}
