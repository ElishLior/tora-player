import 'server-only';
import nodemailer from 'nodemailer';
import { createTranslator } from 'next-intl';
import heMessages from '../../../messages/he.json';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import type { AnnouncedLesson } from '@/lib/notifications/batch-rules';

export function isEmailConfigured(env: Partial<Record<string, string | undefined>> = process.env): boolean {
  return Boolean(
    env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS && env.NOTIFY_FROM_EMAIL && env.NEXT_PUBLIC_APP_URL,
  );
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

interface EmailContent {
  subject: string;
  heading: string;
  /** Trusted HTML between the heading and the button (callers escape their values). */
  bodyHtml: string;
  /** Plain-text version of the body. */
  bodyText: string;
  cta: { label: string; url: string };
}

/**
 * Emails every confirmed user with profiles.notify_new_lessons = true over
 * SMTP (Gmail app password or any provider): Hebrew RTL, logo, one button.
 * One message per recipient so addresses are never exposed to each other.
 * Skipped unless SMTP_*, NOTIFY_FROM_EMAIL and NEXT_PUBLIC_APP_URL are set.
 * Never throws.
 */
async function sendToSubscribers(build: (appUrl: string) => EmailContent): Promise<{ sent: number }> {
  if (!isEmailConfigured()) return { sent: 0 };

  try {
    const { data: recipients, error } = await createAdminSupabaseClient().rpc('new_lesson_email_recipients');
    if (error) throw new Error(error.message);
    const list = (recipients ?? []) as { email: string; display_name: string | null }[];
    if (list.length === 0) return { sent: 0 };

    const port = Number(process.env.SMTP_PORT || 465);
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      pool: true,
      maxConnections: 2,
    });

    const t = createTranslator({ locale: 'he', messages: heMessages, namespace: 'notifications.email' });
    const appUrl = process.env.NEXT_PUBLIC_APP_URL!.replace(/\/$/, '');
    const accountUrl = `${appUrl}/he/me#notifications`;
    const content = build(appUrl);
    const html = `<!doctype html>
<html lang="he" dir="rtl">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;direction:rtl;text-align:right;color:#18181b">
<div style="max-width:480px;margin:0 auto;padding:24px">
<p style="margin:0 0 12px;text-align:center"><img src="${appUrl}/brand/email-logo.png" width="120" height="120" alt="${escapeHtml(t('appName'))}" style="display:inline-block;border:0"></p>
<p style="margin:0 0 8px;font-size:13px;color:#71717a">${escapeHtml(t('appName'))}</p>
<h1 style="margin:0 0 12px;font-size:20px">${escapeHtml(content.heading)}</h1>
${content.bodyHtml}
<p style="margin:0 0 24px"><a href="${content.cta.url}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:15px">${escapeHtml(content.cta.label)}</a></p>
<p style="margin:0;font-size:12px;color:#71717a">${escapeHtml(t('footer'))} <a href="${accountUrl}" style="color:#52525b">${escapeHtml(t('manage'))}</a></p>
</div>
</body>
</html>`;
    const text = `${content.heading}\n${content.bodyText}\n\n${content.cta.label}: ${content.cta.url}\n\n${t('footer')} ${accountUrl}`;

    const results = await Promise.allSettled(
      list.map((recipient) =>
        transport.sendMail({
          from: process.env.NOTIFY_FROM_EMAIL,
          to: recipient.email,
          subject: content.subject,
          html,
          text,
          headers: { 'List-Unsubscribe': `<${accountUrl}>` },
        }),
      ),
    );
    transport.close();

    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed.length > 0) console.error('[email] new-lesson emails failed:', failed.length, failed[0].reason);
    return { sent: results.length - failed.length };
  } catch (err) {
    console.error('[email] new-lesson emails failed:', err);
    return { sent: 0 };
  }
}

/** One new lesson: its title and a button to it. */
export function sendNewLessonEmails(lesson: { id: string; title: string }): Promise<{ sent: number }> {
  const t = createTranslator({ locale: 'he', messages: heMessages, namespace: 'notifications.email' });
  return sendToSubscribers((appUrl) => {
    const lessonUrl = `${appUrl}/he/lessons/${lesson.id}`;
    return {
      subject: t('subject', { title: lesson.title }),
      heading: t('heading'),
      bodyHtml: `<p style="margin:0 0 20px;font-size:17px"><bdi>${escapeHtml(lesson.title)}</bdi></p>`,
      bodyText: lesson.title,
      cta: { label: t('cta'), url: lessonUrl },
    };
  });
}

/** Several lessons published together: one email listing them all (oldest first). */
export function sendNewLessonsDigestEmails(digest: {
  count: number;
  range: string;
  lessons: Array<AnnouncedLesson & { dateLabel: string }>;
}): Promise<{ sent: number }> {
  const t = createTranslator({ locale: 'he', messages: heMessages, namespace: 'notifications.batch' });
  return sendToSubscribers((appUrl) => {
    const items = digest.lessons.map((lesson) => ({ ...lesson, url: `${appUrl}/he/lessons/${lesson.id}` }));
    const list = items
      .map(
        (item) =>
          `<li style="margin:0 0 12px"><a href="${item.url}" style="color:#18181b;font-size:16px;font-weight:bold"><bdi>${escapeHtml(item.title)}</bdi></a><br><span style="font-size:12px;color:#71717a"><bdi>${escapeHtml(item.dateLabel)}</bdi></span></li>`,
      )
      .join('');
    return {
      subject: t('title', { count: digest.count }),
      heading: t('title', { count: digest.count }),
      bodyHtml: `<p style="margin:0 0 16px;font-size:14px;color:#52525b"><bdi>${escapeHtml(digest.range)}</bdi></p>
<ul style="margin:0 0 20px;padding:0 20px 0 0">${list}</ul>`,
      bodyText: `${digest.range}\n\n${items.map((item) => `- ${item.title}: ${item.url}`).join('\n')}`,
      cta: { label: t('emailCta'), url: `${appUrl}/he/lessons` },
    };
  });
}
