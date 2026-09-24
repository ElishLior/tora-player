'use client';

import { useState } from 'react';
import { Bookmark, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { formatDuration } from '@/lib/utils';
import { useBookmarksStore, type LocalBookmark } from '@/stores/bookmarks-store';
import { hasSyncError } from './bookmark-dialog';

const MARKER_COLOR_BY_TAG: Record<string, string> = {
  important: 'bg-red-400',
  review: 'bg-amber-400',
  quote: 'bg-blue-400',
  question: 'bg-purple-400',
};

interface BookmarkMarkersProps {
  bookmarks: LocalBookmark[];
  duration: number;
  onSeek: (position: number) => void;
}

/**
 * Bookmark dots laid over a SeekBar. They are placed from the inline start,
 * like the progress fill, so they line up in both RTL and LTR. Only the dots
 * take pointer events; the rest of the bar stays draggable.
 */
export function BookmarkMarkers({ bookmarks, duration, onSeek }: BookmarkMarkersProps) {
  const t = useTranslations('bookmarks');
  if (duration <= 0 || bookmarks.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-5">
      {bookmarks.map((bookmark) => {
        const percent = Math.min(100, Math.max(0, (bookmark.position / duration) * 100));
        return (
          <button
            key={bookmark.id}
            type="button"
            onClick={() => onSeek(bookmark.position)}
            aria-label={t('jumpToTime', { time: formatDuration(bookmark.position) })}
            title={bookmark.note || undefined}
            className="pointer-events-auto absolute top-0 flex h-5 w-5 items-center justify-center"
            style={{ insetInlineStart: `calc(${percent}% - 10px)` }}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full border border-black/30 shadow-sm transition-transform hover:scale-150 ${MARKER_COLOR_BY_TAG[bookmark.tag] ?? 'bg-primary'}`}
            />
          </button>
        );
      })}
    </div>
  );
}

interface BookmarkChipsProps {
  bookmarks: LocalBookmark[];
  onSeek: (position: number) => void;
}

/** Tap a chip to jump to it; the × deletes it (no long-press/right-click needed). */
export function BookmarkChips({ bookmarks, onSeek }: BookmarkChipsProps) {
  const t = useTranslations('bookmarks');
  const removeBookmark = useBookmarksStore((s) => s.removeBookmark);
  const [deleteSyncFailed, setDeleteSyncFailed] = useState(false);

  if (bookmarks.length === 0) return null;

  const handleDelete = async (id: string) => {
    setDeleteSyncFailed(false);
    const result: unknown = await removeBookmark(id);
    if (hasSyncError(result)) setDeleteSyncFailed(true);
  };

  return (
    <div className="space-y-2">
      <ul className="flex flex-wrap items-center gap-2">
        {bookmarks.map((bookmark) => {
          const time = formatDuration(bookmark.position);
          return (
            <li key={bookmark.id} className="flex items-center rounded-full bg-amber-500/15 text-amber-400">
              <button
                type="button"
                onClick={() => onSeek(bookmark.position)}
                aria-label={t('jumpToTime', { time })}
                className="flex min-w-0 items-center gap-1 rounded-full py-1 pe-1 ps-2.5 text-xs font-medium transition-colors hover:bg-amber-500/25"
              >
                <Bookmark aria-hidden className="h-3 w-3 flex-shrink-0 fill-current" />
                <bdi className="tabular-nums">{time}</bdi>
                {bookmark.note && (
                  <span dir="auto" className="max-w-[8rem] truncate text-amber-200/80">
                    {bookmark.note}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(bookmark.id)}
                aria-label={t('deleteBookmark', { time })}
                className="rounded-full p-1.5 pe-2 text-amber-400/70 transition-colors hover:text-red-400"
              >
                <X aria-hidden className="h-3.5 w-3.5" />
              </button>
            </li>
          );
        })}
      </ul>
      {deleteSyncFailed && (
        <p role="alert" className="text-xs text-amber-200">
          {t('deleteSyncFailed')}
        </p>
      )}
    </div>
  );
}
