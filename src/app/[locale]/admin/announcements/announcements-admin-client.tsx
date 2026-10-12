'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ArrowRight, Eye, Loader2, Megaphone, Pencil, Send } from 'lucide-react';
import { previewReleaseAnnouncement, saveReleaseDraft, sendReleaseAnnouncement } from '@/actions/release-announcements';
import type { ReleasePreview } from '@/lib/notifications/release-announcement';
import {
  RELEASE_BODY_MAX,
  RELEASE_TITLE_MAX,
  type ReleaseAnnouncementRow,
  type ReleaseField,
  type ReleaseText,
} from '@/lib/release-announcement';
import { cn } from '@/lib/utils';

interface ReleaseAnnouncementsClientProps {
  locale: string;
  rows: ReleaseAnnouncementRow[];
  schemaReady: boolean;
  loadFailed: boolean;
  pushConfigured: boolean;
  template: ReleaseText;
}

type FoundPreview = Extract<ReleasePreview, { found: true }>;
type Feedback = { ok: boolean; message: string } | null;

const FIELDS: ReleaseField[] = ['version', 'titleHe', 'bodyHe', 'titleEn', 'bodyEn'];
const INPUT =
  'w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 aria-[invalid=true]:border-red-400';
const BUTTON =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Write, preview and send release notices by hand. Nothing here sends on
 * its own: the only send button sits after a preview and a confirmation.
 */
export function ReleaseAnnouncementsClient({
  locale,
  rows,
  schemaReady,
  loadFailed,
  pushConfigured,
  template,
}: ReleaseAnnouncementsClientProps) {
  const t = useTranslations('releaseAnnouncement');
  const router = useRouter();
  const BackArrow = locale === 'he' ? ArrowRight : ArrowLeft;

  const [form, setForm] = useState<ReleaseText>(template);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<ReleaseField[]>([]);
  const [busy, setBusy] = useState<'save' | 'preview' | 'send' | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [preview, setPreview] = useState<FoundPreview | null>(null);
  const [confirming, setConfirming] = useState(false);

  const sendingOff = !schemaReady || loadFailed;
  const fieldLabel: Record<ReleaseField, string> = {
    version: t('version'),
    titleHe: t('titleHe'),
    bodyHe: t('bodyHe'),
    titleEn: t('titleEn'),
    bodyEn: t('bodyEn'),
  };

  function setField(field: ReleaseField, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function startNewDraft() {
    setDraftId(null);
    setForm(template);
    setInvalid([]);
    setPreview(null);
    setConfirming(false);
    setFeedback(null);
  }

  function editRow(row: ReleaseAnnouncementRow) {
    setDraftId(row.id);
    setForm({
      version: row.version,
      titleHe: row.titleHe,
      bodyHe: row.bodyHe,
      titleEn: row.titleEn,
      bodyEn: row.bodyEn,
    });
    setInvalid([]);
    setPreview(null);
    setConfirming(false);
    setFeedback(null);
  }

  async function save() {
    setBusy('save');
    setFeedback(null);
    const result = await saveReleaseDraft(draftId, form);
    setBusy(null);
    if (!result.ok) {
      setInvalid(result.fields ?? []);
      setFeedback({ ok: false, message: t(`errors.${result.error}`) });
      return;
    }
    setInvalid([]);
    setDraftId(result.id);
    setFeedback({ ok: true, message: t('saved') });
    router.refresh();
  }

  async function openPreview(id: string) {
    setBusy('preview');
    setFeedback(null);
    setConfirming(false);
    const result = await previewReleaseAnnouncement(id);
    setBusy(null);
    if (!result.ok) {
      setFeedback({ ok: false, message: t(`errors.${result.error}`) });
      return;
    }
    setPreview(result.preview);
  }

  async function send() {
    if (!preview) return;
    setBusy('send');
    setFeedback(null);
    // The version on screen is passed back, so a stale page cannot send another release.
    const result = await sendReleaseAnnouncement(preview.row.id, preview.row.version);
    setBusy(null);
    setConfirming(false);
    setPreview(null);
    if (!result.ok) setFeedback({ ok: false, message: t(`errors.${result.error}`) });
    else if (!result.result.ok) setFeedback({ ok: false, message: t(`errors.${result.result.reason}`) });
    else setFeedback({ ok: true, message: t('sent', { sent: result.result.sent, failed: result.result.failed }) });
    router.refresh();
  }

  function blockMessage(block: FoundPreview['block'], liveVersion: string | null, version: string): string | null {
    if (!block) return null;
    if (block === 'live-mismatch') return t('liveMismatch', { live: liveVersion ?? '-', version });
    if (block === 'live-unknown') return t('liveUnknown');
    return t(`errors.${block}`);
  }

  const sendBlocked = sendingOff || !pushConfigured || (preview ? preview.block !== null : true);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Link
        href={`/${locale}/admin`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <BackArrow className="h-4 w-4" aria-hidden="true" />
        {t('back')}
      </Link>

      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <Megaphone className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-xl font-bold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
      </div>

      {!schemaReady && (
        <p role="alert" className="rounded-lg border border-red-400/40 p-3 text-sm text-red-400">
          {t('schemaMissing')}
        </p>
      )}
      {!pushConfigured && (
        <p role="alert" className="rounded-lg border border-red-400/40 p-3 text-sm text-red-400">
          {t('pushNotConfigured')}
        </p>
      )}
      {loadFailed && (
        <p role="alert" className="rounded-lg border border-red-400/40 p-3 text-sm text-red-400">
          {t('errors.load-failed')}
        </p>
      )}

      <section
        aria-labelledby="release-form-title"
        className="space-y-4 rounded-2xl border border-border/50 bg-[hsl(var(--surface-elevated))] p-5"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 id="release-form-title" className="text-sm font-bold">
            {draftId ? t('edit') : t('newDraft')}
          </h2>
          {draftId && (
            <button
              type="button"
              onClick={startNewDraft}
              className={cn(BUTTON, 'text-muted-foreground hover:text-foreground')}
            >
              {t('newDraft')}
            </button>
          )}
        </div>

        {FIELDS.map((field) => {
          const isBody = field === 'bodyHe' || field === 'bodyEn';
          const max = field === 'version' ? 30 : isBody ? RELEASE_BODY_MAX : RELEASE_TITLE_MAX;
          const common = {
            id: `release-${field}`,
            value: form[field],
            maxLength: max,
            'aria-invalid': invalid.includes(field),
            onChange: (event: { target: { value: string } }) => setField(field, event.target.value),
            className: INPUT,
            dir: field.endsWith('En') || field === 'version' ? 'ltr' : 'rtl',
          };
          return (
            <div key={field} className="space-y-1.5">
              <label htmlFor={common.id} className="text-sm font-medium">
                {fieldLabel[field]}
              </label>
              {isBody ? <textarea rows={3} {...common} /> : <input type="text" {...common} />}
            </div>
          );
        })}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={save}
            disabled={sendingOff || busy !== null}
            className={cn(BUTTON, 'bg-primary text-primary-foreground hover:bg-primary/90')}
          >
            {busy === 'save' && (
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            )}
            {t('save')}
          </button>
          <button
            type="button"
            onClick={() => setForm(template)}
            disabled={draftId !== null}
            className={cn(BUTTON, 'text-muted-foreground hover:text-foreground')}
          >
            {t('resetTemplate')}
          </button>
        </div>

        {feedback && (
          <p role="status" className={cn('text-sm', feedback.ok ? 'text-primary' : 'text-red-400')}>
            {feedback.message}
          </p>
        )}
      </section>

      {preview && (
        <section
          aria-labelledby="release-preview-title"
          className="space-y-3 rounded-2xl border border-primary/30 bg-[hsl(var(--surface-elevated))] p-5"
        >
          <h2 id="release-preview-title" className="text-sm font-bold">
            {t('preview')}
          </h2>
          <div className="space-y-1 rounded-xl bg-background/60 p-3">
            <p className="text-sm font-semibold">{preview.row.titleHe}</p>
            <p className="text-sm text-muted-foreground">{preview.row.bodyHe}</p>
          </div>
          <p className="text-sm">{t('previewAudience', { count: preview.audience })}</p>
          <p className="text-sm text-muted-foreground">{t('previewLive', { live: preview.liveVersion ?? '-' })}</p>
          {blockMessage(preview.block, preview.liveVersion, preview.row.version) && (
            <p className="text-sm text-red-400">
              {blockMessage(preview.block, preview.liveVersion, preview.row.version)}
            </p>
          )}

          {confirming ? (
            <div className="space-y-3 rounded-xl border border-red-400/40 p-3">
              <p className="text-sm font-semibold">{t('confirmQuestion', { count: preview.audience })}</p>
              <p className="text-xs text-muted-foreground">{t('confirmBody')}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={send}
                  disabled={busy !== null}
                  className={cn(BUTTON, 'bg-primary text-primary-foreground hover:bg-primary/90')}
                >
                  {busy === 'send' ? (
                    <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  ) : (
                    <Send className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
                  )}
                  {busy === 'send' ? t('sending') : t('confirm')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={busy !== null}
                  className={cn(BUTTON, 'text-muted-foreground hover:text-foreground')}
                >
                  {t('cancel')}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={sendBlocked || busy !== null}
                className={cn(BUTTON, 'bg-primary text-primary-foreground hover:bg-primary/90')}
              >
                <Send className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
                {t('send')}
              </button>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className={cn(BUTTON, 'text-muted-foreground hover:text-foreground')}
              >
                {t('cancel')}
              </button>
            </div>
          )}
        </section>
      )}

      <section aria-labelledby="release-history-title" className="space-y-3">
        <h2 id="release-history-title" className="text-sm font-medium text-muted-foreground">
          {t('history')}
        </h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border/50 bg-[hsl(var(--surface-elevated))] p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    <bdi>{row.version}</bdi> · {row.titleHe}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(`status.${row.status}`)}
                    {row.status === 'sent' && ` · ${row.sentCount}`}
                  </p>
                </div>
                {row.status === 'draft' && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => editRow(row)}
                      disabled={sendingOff || busy !== null}
                      className={cn(BUTTON, 'px-3 text-muted-foreground hover:text-foreground')}
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                      {t('edit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => openPreview(row.id)}
                      disabled={sendingOff || busy !== null}
                      className={cn(BUTTON, 'px-3 text-primary hover:bg-primary/10')}
                    >
                      {busy === 'preview' ? (
                        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                      {t('preview')}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
