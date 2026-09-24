import { useTranslations } from 'next-intl';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { NOTIFY_MODES, type NotifyMode } from '@/lib/notifications/batch-rules';

interface UploadActionBarProps {
  /** Distance from the viewport bottom (bottom nav, mini player). */
  bottomOffset: number;
  notifyMode: NotifyMode;
  onNotifyMode: (mode: NotifyMode) => void;
  /** Lessons the buttons would upload. */
  count: number;
  /** Lessons that need attention before anything can upload. */
  blocked: number;
  checking: boolean;
  running: boolean;
  progress: { percent: number; done: number; total: number } | null;
  failed: number;
  finished: boolean;
  onPublish: () => void;
  onSaveDraft: () => void;
  onStartOver: () => void;
}

/** Batch controls pinned above the bottom navigation: notification choice, draft save, publish. */
export function UploadActionBar({
  bottomOffset,
  notifyMode,
  onNotifyMode,
  count,
  blocked,
  checking,
  running,
  progress,
  failed,
  finished,
  onPublish,
  onSaveDraft,
  onStartOver,
}: UploadActionBarProps) {
  const t = useTranslations('upload');
  const disabled = running || checking || blocked > 0 || count === 0;

  return (
    <div
      className="fixed inset-x-0 z-40 border-t border-[hsl(0,0%,18%)] bg-background/95 backdrop-blur-xl"
      style={{ bottom: bottomOffset }}
    >
      <div className="mx-auto max-w-2xl space-y-2.5 px-4 py-3">
        {running ? (
          <div className="space-y-1.5" role="status">
            <p className="flex items-center gap-2 text-sm font-bold">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              {progress && progress.total > 0 ? (
                <bdi>{t('progress', progress)}</bdi>
              ) : (
                t('preparing')
              )}
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-[hsl(0,0%,24%)]">
              <div className="h-full bg-primary transition-[width]" style={{ width: `${progress?.percent ?? 0}%` }} />
            </div>
          </div>
        ) : finished ? (
          <div className="flex items-center gap-3">
            <p className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-bold text-primary">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              {t('allDone')}
            </p>
            <button
              type="button"
              onClick={onStartOver}
              className="rounded-full bg-[hsl(var(--surface-elevated))] px-4 py-2 text-sm font-bold hover:bg-[hsl(var(--surface-highlight))]"
            >
              {t('startOver')}
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="flex-shrink-0 text-xs font-bold text-muted-foreground">{t('notify.label')}</span>
              <div
                role="radiogroup"
                aria-label={t('notify.label')}
                className="grid min-w-0 flex-1 grid-cols-3 rounded-full bg-[hsl(var(--surface-elevated))] p-0.5"
              >
                {NOTIFY_MODES.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={notifyMode === mode}
                    onClick={() => onNotifyMode(mode)}
                    className={`truncate rounded-full px-2 py-1.5 text-[11px] font-bold transition-colors sm:text-xs ${
                      notifyMode === mode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t(`notify.${mode}`)}
                  </button>
                ))}
              </div>
            </div>

            {(blocked > 0 || checking || failed > 0) && (
              <p className={`text-xs ${blocked > 0 || failed > 0 ? 'text-amber-400' : 'text-muted-foreground'}`}>
                {blocked > 0 ? t('blocked', { count: blocked }) : checking ? t('checkingExisting') : t('someFailed', { count: failed })}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onSaveDraft}
                disabled={disabled}
                className="rounded-full bg-[hsl(var(--surface-elevated))] px-4 py-3 text-sm font-bold hover:bg-[hsl(var(--surface-highlight))] disabled:opacity-40"
              >
                {t('saveDraft')}
              </button>
              <button
                type="button"
                onClick={onPublish}
                disabled={disabled}
                className="flex-1 rounded-full bg-primary py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
              >
                {t('publishAll', { count })}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
