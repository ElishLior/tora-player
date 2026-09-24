'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ArrowRight, Bell, Loader2, Send } from 'lucide-react';
import { sendTestNotification } from '@/actions/notifications';
import { PushToggle } from '@/components/notifications/push-toggle';
import { usePushNotifications } from '@/components/notifications/use-push-notifications';

interface NotificationsAdminClientProps {
  locale: string;
  pushConfigured: boolean;
  emailConfigured: boolean;
  subscriberCount: number | null;
  linkedSubscriberCount: number | null;
  emailRecipientCount: number | null;
}

export function NotificationsAdminClient({
  locale,
  pushConfigured,
  emailConfigured,
  subscriberCount,
  linkedSubscriberCount,
  emailRecipientCount,
}: NotificationsAdminClientProps) {
  const t = useTranslations('notifications.admin');
  const { endpoint } = usePushNotifications();
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const BackArrow = locale === 'he' ? ArrowRight : ArrowLeft;

  async function handleSendTest() {
    if (!endpoint) return;
    setSending(true);
    setResult(null);
    try {
      const response = await sendTestNotification(endpoint);
      setResult(
        response.ok
          ? { ok: true, message: t('testSent') }
          : { ok: false, message: t(`testErrors.${response.error}`) },
      );
    } catch {
      setResult({ ok: false, message: t('testErrors.failed') });
    } finally {
      setSending(false);
    }
  }

  const stats = [
    { label: t('pushStatus'), value: pushConfigured ? t('configured') : t('notConfigured') },
    { label: t('emailStatus'), value: emailConfigured ? t('configured') : t('notConfigured') },
    { label: t('subscribers'), value: subscriberCount },
    { label: t('linkedSubscribers'), value: linkedSubscriberCount },
    { label: t('emailRecipients'), value: emailRecipientCount },
  ];

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Link href={`/${locale}/admin`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <BackArrow className="h-4 w-4" />
        {t('back')}
      </Link>

      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <Bell className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border/50 bg-[hsl(var(--surface-elevated))] p-3">
            <dt className="text-xs text-muted-foreground">{stat.label}</dt>
            <dd className="mt-1 text-lg font-bold tabular-nums">{stat.value ?? '—'}</dd>
          </div>
        ))}
      </dl>

      <section className="space-y-4 rounded-2xl border border-border/50 bg-[hsl(var(--surface-elevated))] p-5">
        <h2 className="text-sm font-bold">{t('thisDevice')}</h2>
        <PushToggle />
        <button
          type="button"
          onClick={handleSendTest}
          disabled={!endpoint || !pushConfigured || sending}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 rtl:-scale-x-100" />}
          {t('sendTest')}
        </button>
        {result && (
          <p role="status" className={`text-sm ${result.ok ? 'text-primary' : 'text-red-400'}`}>
            {result.message}
          </p>
        )}
      </section>
    </div>
  );
}
