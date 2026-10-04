'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { diag, diagnostics, environmentInfo } from '@/lib/playback-diagnostics';

type CopyState = 'idle' | 'copied' | 'failed';

/** Opt-in playback log for real-device checks. The log stays in this browser's storage. */
export default function DiagnosticsPage() {
  const t = useTranslations('diagnostics');
  const [enabled, setEnabled] = useState(false);
  const [text, setText] = useState('');
  const [count, setCount] = useState(0);
  const [copy, setCopy] = useState<CopyState>('idle');

  const refresh = useCallback(() => {
    const log = diagnostics();
    setEnabled(log.isEnabled());
    setCount(log.entries().length);
    setText(log.format(environmentInfo()));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggle = () => {
    const log = diagnostics();
    const next = !log.isEnabled();
    log.setEnabled(next);
    if (next) diag('diag:enabled', environmentInfo());
    else log.flush();
    refresh();
  };

  const copyLog = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopy('copied');
    } catch {
      setCopy('failed');
    }
  };

  const clear = () => {
    diagnostics().clear();
    refresh();
  };

  const button =
    'rounded-full bg-[hsl(var(--surface-elevated))] px-4 py-2 text-sm font-medium hover:bg-[hsl(var(--surface-highlight))]';

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <h1 className="text-xl font-bold">{t('title')}</h1>
      <p className="text-sm text-muted-foreground">{t('intro')}</p>
      <p role="status" className="text-sm font-medium">
        {enabled ? t('statusOn') : t('statusOff')} · {t('entries', { count })}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={toggle} className={button}>
          {enabled ? t('disable') : t('enable')}
        </button>
        <button type="button" onClick={refresh} className={button}>
          {t('refresh')}
        </button>
        <button type="button" onClick={copyLog} className={button}>
          {t('copy')}
        </button>
        <button type="button" onClick={clear} className={button}>
          {t('clear')}
        </button>
      </div>
      {copy === 'copied' && (
        <p role="status" className="text-sm text-primary">
          {t('copied')}
        </p>
      )}
      {copy === 'failed' && (
        <p role="alert" className="text-sm text-red-400">
          {t('copyFailed')}
        </p>
      )}
      {count === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <pre
          dir="ltr"
          className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-all rounded-lg bg-[hsl(var(--surface-elevated))] p-3 text-xs"
        >
          {text}
        </pre>
      )}
    </div>
  );
}
