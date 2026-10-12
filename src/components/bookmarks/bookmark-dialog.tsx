'use client';

import { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Bookmark } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useBookmarksStore, type LocalBookmark } from '@/stores/bookmarks-store';
import { formatDuration } from '@/lib/utils';
import { BOOKMARK_NOTE_MAX } from '@/lib/bookmark-rules';
import { useModalDialog } from '@/hooks/use-modal-dialog';

const PREDEFINED_TAGS = [
  { value: 'important', label: 'חשוב', labelEn: 'Important', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  { value: 'review', label: 'לחזור', labelEn: 'Review', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  { value: 'quote', label: 'ציטוט', labelEn: 'Quote', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { value: 'question', label: 'שאלה', labelEn: 'Question', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
];

export function getTagInfo(tagValue: string) {
  return PREDEFINED_TAGS.find((t) => t.value === tagValue);
}

/**
 * Bookmark store mutations apply locally at once and resolve with
 * `{ error }` when the account sync failed.
 */
export function hasSyncError(result: unknown): boolean {
  return typeof result === 'object' && result !== null && 'error' in result && Boolean(result.error);
}

type BookmarkDialogProps = { onClose: () => void } & (
  | {
      /** Edit mode: the existing bookmark. Its id, lesson, part and position stay as they are. */
      bookmark: LocalBookmark;
      lessonId?: never;
      audioFileId?: never;
      position?: never;
    }
  | {
      /** Add mode: a new bookmark at this position. */
      bookmark?: never;
      lessonId: string;
      /** Part (audio file) and position when the dialog was opened; typing a note must not move them. */
      audioFileId: string | undefined;
      position: number;
    }
);

type Status = 'editing' | 'saving' | 'sync-failed' | 'save-failed' | 'changed-elsewhere';

/**
 * Add a bookmark, or edit the note and tag of an existing one (pass `bookmark`).
 * Mount it only while open: the bookmark version and the position are captured
 * on mount. Escape and the backdrop cancel; both are blocked while saving.
 */
export function BookmarkDialog(props: BookmarkDialogProps) {
  const { onClose } = props;
  const t = useTranslations('bookmarks');
  const te = useTranslations('bookmarkEdit');
  const isHebrew = useLocale() === 'he';
  const noteId = useId();
  const counterId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const busy = useRef(false);

  const [initial] = useState<LocalBookmark | null>(() => props.bookmark ?? null);
  const [position] = useState(() => (props.bookmark ? props.bookmark.position : props.position));
  const [addTarget] = useState(() =>
    props.bookmark ? null : { lessonId: props.lessonId, audioFileId: props.audioFileId },
  );
  const [note, setNote] = useState(() => initial?.note ?? '');
  // Edit mode keeps the stored tag exactly (even none); add mode starts on "important".
  const [tag, setTag] = useState(() => (initial ? initial.tag : 'important'));
  const [status, setStatus] = useState<Status>('editing');
  const addBookmark = useBookmarksStore((s) => s.addBookmark);
  const updateBookmark = useBookmarksStore((s) => s.updateBookmark);

  const requestClose = () => {
    if (!busy.current) onClose();
  };
  useModalDialog(dialogRef, requestClose);

  const locked = status === 'saving' || status === 'changed-elsewhere';

  const handleSave = async () => {
    if (busy.current) return;
    busy.current = true;
    setStatus('saving');
    try {
      if (initial) {
        // Nothing changed: close without touching the store or the account.
        if (note === initial.note && tag === initial.tag) {
          onClose();
          return;
        }
        const result = await updateBookmark(
          initial.id,
          { note, tag },
          { expectedUpdatedAt: initial.updatedAt ?? null },
        );
        if (!result.error) onClose();
        else if (result.error === 'sync_failed') setStatus('sync-failed');
        else if (result.error === 'changed_elsewhere') setStatus('changed-elsewhere');
        else setStatus('save-failed');
        return;
      }
      if (!addTarget) return;
      const result: unknown = await addBookmark(addTarget.lessonId, position, note, tag, {
        audioFileId: addTarget.audioFileId,
      });
      // The bookmark is already saved on the device; only the account sync failed.
      if (hasSyncError(result)) setStatus('sync-failed');
      else onClose();
    } finally {
      busy.current = false;
    }
  };

  const title = initial ? te('title') : t('addBookmark');

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        // Portalled: keep clicks from reaching the player that opened the dialog.
        e.stopPropagation();
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby="bookmark-dialog-title"
        className="w-full sm:max-w-md bg-[hsl(0,0%,12%)] rounded-t-2xl sm:rounded-2xl p-5 space-y-4 animate-slide-up focus:outline-none"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bookmark className="h-5 w-5 text-primary" />
            <h3 id="bookmark-dialog-title" className="text-lg font-bold">
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={status === 'saving'}
            aria-label={t('close')}
            className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--surface-highlight))] transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 motion-reduce:transition-none"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t('time')}</span>
          <bdi className="font-mono text-primary font-bold text-base tabular-nums">
            {formatDuration(Math.round(position))}
          </bdi>
        </div>

        {status === 'sync-failed' ? (
          <>
            <p role="alert" className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
              {initial ? te('notUploaded') : t('syncFailed')}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 motion-reduce:transition-none"
            >
              {t('close')}
            </button>
          </>
        ) : (
          <>
            <fieldset disabled={locked} className="space-y-4 min-w-0">
              <div className="space-y-2">
                <span className="text-sm text-muted-foreground font-medium">{t('tag')}</span>
                <div className="flex flex-wrap gap-2">
                  {PREDEFINED_TAGS.map((option) => (
                    <button
                      type="button"
                      key={option.value}
                      // Edit mode: tapping the active tag removes it (an old bookmark may have none).
                      onClick={() => setTag(initial && tag === option.value ? '' : option.value)}
                      aria-pressed={tag === option.value}
                      className={`min-h-11 px-3 py-1.5 rounded-full text-sm font-medium border transition-all motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                        tag === option.value
                          ? `${option.color} border-current ring-1 ring-current/30 scale-105 motion-reduce:scale-100`
                          : 'bg-[hsl(var(--surface-elevated))] text-muted-foreground border-transparent hover:border-[hsl(0,0%,30%)]'
                      }`}
                    >
                      {isHebrew ? option.label : option.labelEn}
                    </button>
                  ))}
                </div>
              </div>

              <div className="block space-y-2">
                <label htmlFor={noteId} className="text-sm text-muted-foreground font-medium">
                  {t('note')}
                </label>
                <textarea
                  id={noteId}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t('notePlaceholder')}
                  maxLength={BOOKMARK_NOTE_MAX}
                  aria-describedby={counterId}
                  className="w-full rounded-xl bg-[hsl(var(--surface-elevated))] border border-[hsl(0,0%,22%)] px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 resize-none disabled:opacity-60"
                  rows={3}
                  dir="auto"
                />
                <p
                  id={counterId}
                  className={`text-end text-xs tabular-nums ${note.length >= BOOKMARK_NOTE_MAX ? 'text-amber-300' : 'text-muted-foreground'}`}
                >
                  <bdi dir="ltr">{te('noteCount', { count: note.length, max: BOOKMARK_NOTE_MAX })}</bdi>
                </p>
              </div>
            </fieldset>

            {status === 'save-failed' && (
              <p role="alert" className="rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-100">
                {te('saveFailed')}
              </p>
            )}
            {status === 'changed-elsewhere' && (
              <p role="alert" className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                {te('changedElsewhere')}
              </p>
            )}

            <div className="flex gap-3 pt-1">
              {status === 'changed-elsewhere' ? (
                <>
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 min-h-11 rounded-xl bg-[hsl(var(--surface-elevated))] px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 motion-reduce:transition-none"
                  >
                    {t('close')}
                  </button>
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="flex-1 min-h-11 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 motion-reduce:transition-none"
                  >
                    {te('reload')}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={requestClose}
                    disabled={status === 'saving'}
                    className="flex-1 min-h-11 rounded-xl bg-[hsl(var(--surface-elevated))] px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 motion-reduce:transition-none"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={status === 'saving'}
                    aria-busy={status === 'saving'}
                    className="flex-1 min-h-11 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 motion-reduce:transition-none"
                  >
                    {status === 'saving' ? te('saving') : t('save')}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
