'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Clock3, ExternalLink, FileText, Loader2, Trash2, Upload } from 'lucide-react';
import { getLessonSourceForAdmin, removeLessonSource, setLessonSourceExpected } from '@/actions/lesson-sources';
import { LessonSourceUploadError, uploadLessonSourcePdf } from '@/hooks/use-upload';
import { MAX_SOURCE_PDF_BYTES, formatFileSize, isPdfFileName, lessonSourcePath, type LessonSource } from '@/lib/lesson-sources';

const BUTTON =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-50';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; source: LessonSource | null }
  | { kind: 'unavailable'; reason: 'schema_missing' | 'failed' | 'unauthorized' };

/**
 * Admin control for a lesson's sources PDF ("מקורות השיעור"), on the lesson's edit
 * page: upload, replace (the old PDF stays live until the new one is stored),
 * remove, and the "will be added later" promise. Nothing here notifies anyone.
 */
export function LessonSourceEditor({ lessonId }: { lessonId: string }) {
  const t = useTranslations('lessonSources');
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [busy, setBusy] = useState<'upload' | 'remove' | 'expected' | null>(null);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getLessonSourceForAdmin(lessonId).then((result) => {
      if (cancelled) return;
      setState(result.ok ? { kind: 'ready', source: result.source } : { kind: 'unavailable', reason: result.error === 'has-file' ? 'failed' : result.error });
    });
    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  const source = state.kind === 'ready' ? state.source : null;

  async function upload(file: File) {
    if (!isPdfFileName(file.name) && file.type !== 'application/pdf') {
      setMessage({ ok: false, text: t('errors.not-pdf') });
      return;
    }
    if (file.size > MAX_SOURCE_PDF_BYTES) {
      setMessage({ ok: false, text: t('errors.too-large', { size: formatFileSize(MAX_SOURCE_PDF_BYTES) }) });
      return;
    }
    setBusy('upload');
    setProgress(0);
    setMessage(null);
    try {
      const stored = await uploadLessonSourcePdf(file, lessonId, setProgress);
      setState({ kind: 'ready', source: stored });
      setMessage({ ok: true, text: source?.status === 'ready' ? t('replaced') : t('published') });
    } catch (error) {
      const code = error instanceof LessonSourceUploadError ? error.code : 'failed';
      setMessage({ ok: false, text: t.has(`errors.${code}`) ? t(`errors.${code}`) : t('errors.failed') });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!window.confirm(t('confirmRemove'))) return;
    setBusy('remove');
    setMessage(null);
    const result = await removeLessonSource(lessonId);
    setBusy(null);
    if (result.ok) {
      setState({ kind: 'ready', source: null });
      setMessage({ ok: true, text: t('removed') });
    } else {
      setMessage({ ok: false, text: t(`errors.${result.error}`) });
    }
  }

  async function toggleExpected(expected: boolean) {
    setBusy('expected');
    setMessage(null);
    const result = await setLessonSourceExpected(lessonId, expected);
    setBusy(null);
    if (result.ok) setState({ kind: 'ready', source: result.source });
    else setMessage({ ok: false, text: t(`errors.${result.error}`) });
  }

  return (
    <section aria-labelledby="lesson-sources-admin-title" className="border-t border-[hsl(0,0%,18%)] pt-6">
      <div className="mb-3 flex items-center gap-2">
        <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 id="lesson-sources-admin-title" className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          {t('title')}
        </h2>
      </div>
      <p className="mb-3 text-sm text-muted-foreground">{t('adminHint')}</p>

      {state.kind === 'loading' && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label={t('loading')} />}

      {state.kind === 'unavailable' && (
        <p role="status" className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200">
          {t(`errors.${state.reason}`)}
        </p>
      )}

      {state.kind === 'ready' && (
        <div className="grid gap-3">
          {source?.status === 'ready' ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[hsl(var(--surface-elevated))] p-3">
              <FileText className="h-8 w-8 flex-shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground" dir="auto">
                  {source.fileName}
                </p>
                <p className="text-xs text-muted-foreground">
                  PDF · {formatFileSize(source.fileSize ?? 0)} ·{' '}
                  {t('updated', { date: new Date(source.updatedAt).toLocaleDateString('he-IL') })}
                </p>
              </div>
              <a
                href={lessonSourcePath(lessonId, 'open')}
                target="_blank"
                rel="noopener noreferrer"
                className={`${BUTTON} bg-[hsl(var(--surface-highlight))] text-foreground`}
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                {t('open')}
              </a>
            </div>
          ) : source?.status === 'expected' ? (
            <p className="flex items-center gap-2 rounded-xl bg-[hsl(var(--surface-elevated))] p-3 text-sm text-foreground">
              <Clock3 className="h-4 w-4 text-primary" aria-hidden="true" />
              {t('expectedAdmin')}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">{t('none')}</p>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void upload(file);
            }}
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy !== null}
              className={`${BUTTON} bg-primary text-primary-foreground hover:bg-primary/90`}
            >
              {busy === 'upload' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
              {busy === 'upload' ? t('uploading', { percent: progress }) : source?.status === 'ready' ? t('replace') : t('upload')}
            </button>

            {source?.status === 'ready' && (
              <button
                type="button"
                onClick={() => void remove()}
                disabled={busy !== null}
                className={`${BUTTON} text-destructive hover:bg-destructive/10`}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                {t('remove')}
              </button>
            )}

            {source?.status !== 'ready' && (
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 px-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={source?.status === 'expected'}
                  disabled={busy !== null}
                  onChange={(event) => void toggleExpected(event.target.checked)}
                  className="h-5 w-5 accent-[hsl(var(--primary))]"
                />
                {t('expectedToggle')}
              </label>
            )}
          </div>
        </div>
      )}

      {message && (
        <p role={message.ok ? 'status' : 'alert'} className={`mt-2 text-sm ${message.ok ? 'text-primary' : 'text-destructive'}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}
