'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCastStatus } from '@/lib/cast-utils';

const VISIBLE_MS = 8000;

/** The outcome of the last Cast tap (no devices, guidance, …), shown inline for a few seconds. */
export function CastStatusMessage() {
  const t = useTranslations('player');
  const status = useCastStatus((s) => s.status);

  useEffect(() => {
    if (!status) return;
    const id = window.setTimeout(() => useCastStatus.setState({ status: null }), VISIBLE_MS);
    return () => window.clearTimeout(id);
  }, [status]);

  if (!status) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-36 z-[110] mx-auto flex max-w-md items-start gap-2 rounded-lg border border-[hsl(0,0%,20%)] bg-[hsl(var(--surface-elevated))] px-4 py-3 text-sm text-foreground shadow-2xl"
    >
      <p className="flex-1">{t(`castStatus.${status}`)}</p>
      <button
        type="button"
        onClick={() => useCastStatus.setState({ status: null })}
        className="-me-2 -mt-1 rounded-full p-1 text-muted-foreground hover:text-foreground"
        aria-label={t('dismiss')}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
