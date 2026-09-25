'use client';

import { useState } from 'react';
import { X, Bookmark } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useBookmarksStore } from '@/stores/bookmarks-store';
import { formatDuration } from '@/lib/utils';

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

interface BookmarkDialogProps {
  onClose: () => void;
  lessonId: string;
  /** Part (audio file) and position when the dialog was opened; typing a note must not move them. */
  audioFileId: string | undefined;
  position: number;
}

/** Mount it only while open: the position is captured when it mounts. */
export function BookmarkDialog({ onClose, lessonId, audioFileId, position }: BookmarkDialogProps) {
  const t = useTranslations('bookmarks');
  const isHebrew = useLocale() === 'he';
  const [bookmarkPosition] = useState(position);
  const [note, setNote] = useState('');
  const [selectedTag, setSelectedTag] = useState('important');
  const [status, setStatus] = useState<'editing' | 'saving' | 'sync-failed'>('editing');
  const addBookmark = useBookmarksStore((s) => s.addBookmark);

  const handleSave = async () => {
    setStatus('saving');
    const result: unknown = await addBookmark(lessonId, bookmarkPosition, note, selectedTag, { audioFileId });
    // The bookmark is already saved on the device; only the account sync failed.
    if (hasSyncError(result)) setStatus('sync-failed');
    else onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bookmark-dialog-title"
        className="w-full sm:max-w-md bg-[hsl(0,0%,12%)] rounded-t-2xl sm:rounded-2xl p-5 space-y-4 animate-slide-up"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bookmark className="h-5 w-5 text-primary" />
            <h3 id="bookmark-dialog-title" className="text-lg font-bold">
              {t('addBookmark')}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--surface-highlight))] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t('time')}</span>
          <bdi className="font-mono text-primary font-bold text-base tabular-nums">
            {formatDuration(Math.round(bookmarkPosition))}
          </bdi>
        </div>

        {status === 'sync-failed' ? (
          <>
            <p role="alert" className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
              {t('syncFailed')}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              {t('close')}
            </button>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <span className="text-sm text-muted-foreground font-medium">{t('tag')}</span>
              <div className="flex flex-wrap gap-2">
                {PREDEFINED_TAGS.map((tag) => (
                  <button
                    type="button"
                    key={tag.value}
                    onClick={() => setSelectedTag(tag.value)}
                    aria-pressed={selectedTag === tag.value}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                      selectedTag === tag.value
                        ? `${tag.color} border-current ring-1 ring-current/30 scale-105`
                        : 'bg-[hsl(var(--surface-elevated))] text-muted-foreground border-transparent hover:border-[hsl(0,0%,30%)]'
                    }`}
                  >
                    {isHebrew ? tag.label : tag.labelEn}
                  </button>
                ))}
              </div>
            </div>

            <label className="block space-y-2">
              <span className="text-sm text-muted-foreground font-medium">{t('note')}</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('notePlaceholder')}
                className="w-full rounded-xl bg-[hsl(var(--surface-elevated))] border border-[hsl(0,0%,22%)] px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 resize-none"
                rows={3}
                dir="auto"
              />
            </label>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl bg-[hsl(var(--surface-elevated))] px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={status === 'saving'}
                className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {t('save')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
