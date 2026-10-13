'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ArrowRight, Loader2, SlidersHorizontal } from 'lucide-react';
import { updateTipInterval } from '@/actions/app-settings';
import { TIP_INTERVAL_OPTIONS } from '@/lib/app-settings';

interface AppSettingsClientProps {
  locale: string;
  tipIntervalSeconds: number;
  schemaReady: boolean;
}

type Feedback = { ok: boolean; message: string } | null;

/** Display settings for the whole app. Today: how fast the home page's tips change. */
export function AppSettingsClient({ locale, tipIntervalSeconds, schemaReady }: AppSettingsClientProps) {
  const t = useTranslations('adminSettings');
  const BackArrow = locale === 'he' ? ArrowRight : ArrowLeft;
  const [value, setValue] = useState(tipIntervalSeconds);
  const [saved, setSaved] = useState(tipIntervalSeconds);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function save() {
    setBusy(true);
    setFeedback(null);
    const result = await updateTipInterval(value);
    setBusy(false);
    if (result.ok) {
      setSaved(value);
      setFeedback({ ok: true, message: t('saved') });
    } else {
      setFeedback({ ok: false, message: t(`errors.${result.error}`) });
    }
  }

  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/${locale}/admin`}
          aria-label={t('back')}
          className="grid h-11 w-11 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <BackArrow className="h-5 w-5" aria-hidden="true" />
        </Link>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <SlidersHorizontal className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-bold text-foreground">{t('title')}</h1>
      </div>

      {!schemaReady && (
        <p role="status" className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200">
          {t('schemaMissing')}
        </p>
      )}

      <section className="grid gap-3 rounded-xl border border-border/50 bg-[hsl(var(--surface-elevated))] p-4">
        <div>
          <h2 className="font-medium text-foreground">{t('tips.title')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('tips.description')}</p>
        </div>
        <label className="grid gap-1.5 text-sm">
          <span className="text-muted-foreground">{t('tips.label')}</span>
          <select
            value={value}
            onChange={(event) => setValue(Number(event.target.value))}
            disabled={!schemaReady || busy}
            className="min-h-11 w-full max-w-xs rounded-lg border border-border/60 bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50"
          >
            {TIP_INTERVAL_OPTIONS.map((seconds) => (
              <option key={seconds} value={seconds}>
                {seconds === 0 ? t('tips.off') : t('tips.seconds', { count: seconds })}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void save()}
            disabled={!schemaReady || busy || value === saved}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {t('save')}
          </button>
          {feedback && (
            <p role={feedback.ok ? 'status' : 'alert'} className={feedback.ok ? 'text-sm text-primary' : 'text-sm text-destructive'}>
              {feedback.message}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
