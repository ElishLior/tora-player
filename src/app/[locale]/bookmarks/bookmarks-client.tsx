'use client';

import { useState } from 'react';
import { Bookmark, Trash2, Play, Clock } from 'lucide-react';
import { useBookmarksStore, type LocalBookmark } from '@/stores/bookmarks-store';
import { getTagInfo } from '@/components/bookmarks/bookmark-dialog';
import { formatDuration } from '@/lib/utils';
import { Link } from '@/i18n/routing';

interface BookmarksPageClientProps {
  locale: string;
}

export function BookmarksPageClient({ locale }: BookmarksPageClientProps) {
  const bookmarks = useBookmarksStore((s) => s.bookmarks);
  const removeBookmark = useBookmarksStore((s) => s.removeBookmark);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const isRTL = locale === 'he';

  // Group by lessonId
  const grouped = bookmarks.reduce<Record<string, LocalBookmark[]>>((acc, bm) => {
    if (!acc[bm.lessonId]) acc[bm.lessonId] = [];
    acc[bm.lessonId].push(bm);
    return acc;
  }, {});

  // Sort groups by most recent bookmark
  const sortedGroups = Object.entries(grouped).sort((a, b) => {
    const latestA = Math.max(...a[1].map((bm) => new Date(bm.createdAt).getTime()));
    const latestB = Math.max(...b[1].map((bm) => new Date(bm.createdAt).getTime()));
    return latestB - latestA;
  });

  const handleDelete = (id: string) => {
    if (confirmDelete === id) {
      removeBookmark(id);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(id);
      // Auto-clear confirm after 3 seconds
      setTimeout(() => setConfirmDelete(null), 3000);
    }
  };

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <h1 className="text-2xl font-bold">
        {isRTL ? 'סימניות' : 'Bookmarks'}
      </h1>

      {bookmarks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-[hsl(var(--surface-elevated))] p-5 mb-4">
            <Bookmark className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-bold mb-1">
            {isRTL ? 'אין סימניות עדיין' : 'No bookmarks yet'}
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            {isRTL
              ? 'לחץ על כפתור הסימניה בנגן כדי לשמור רגעים חשובים'
              : 'Tap the bookmark button in the player to save important moments'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedGroups.map(([lessonId, lessonBookmarks]) => {
            // Sort bookmarks by position
            const sorted = [...lessonBookmarks].sort((a, b) => a.position - b.position);

            return (
              <div key={lessonId} className="space-y-2">
                {/* Lesson title / link */}
                <Link
                  href={`/lessons/${lessonId}`}
                  className="text-sm font-bold text-primary hover:underline truncate block"
                >
                  {isRTL ? 'שיעור' : 'Lesson'} - {lessonId.slice(0, 8)}...
                </Link>

                <div className="space-y-1">
                  {sorted.map((bm) => {
                    const tagInfo = getTagInfo(bm.tag);
                    const isConfirming = confirmDelete === bm.id;

                    return (
                      <div
                        key={bm.id}
                        className="flex items-start gap-3 rounded-xl bg-[hsl(var(--surface-elevated))] p-3 group"
                      >
                        {/* Timestamp + play link */}
                        <Link
                          href={`/lessons/${bm.lessonId}?t=${Math.round(bm.position)}`}
                          className="flex items-center gap-1.5 text-primary hover:text-primary/80 flex-shrink-0 mt-0.5"
                        >
                          <Play className="h-3.5 w-3.5 fill-current" />
                          <span className="text-xs font-mono font-bold">
                            {formatDuration(Math.round(bm.position))}
                          </span>
                        </Link>

                        {/* Content */}
                        <div className="flex-1 min-w-0 space-y-1">
                          {/* Tag pill */}
                          {tagInfo && (
                            <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full ${
                              tagInfo.value === 'important' ? 'bg-red-500/15 text-red-400' :
                              tagInfo.value === 'review' ? 'bg-amber-500/15 text-amber-400' :
                              tagInfo.value === 'quote' ? 'bg-blue-500/15 text-blue-400' :
                              'bg-purple-500/15 text-purple-400'
                            }`}>
                              {isRTL ? tagInfo.label : tagInfo.labelEn}
                            </span>
                          )}
                          {/* Note text */}
                          {bm.note && (
                            <p className="text-sm text-foreground leading-relaxed">
                              {bm.note}
                            </p>
                          )}
                          {/* Creation date */}
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {new Date(bm.createdAt).toLocaleDateString(isRTL ? 'he-IL' : 'en-US')}
                          </div>
                        </div>

                        {/* Delete */}
                        <button
                          onClick={() => handleDelete(bm.id)}
                          className={`p-1.5 rounded-full transition-colors flex-shrink-0 ${
                            isConfirming
                              ? 'text-red-400 bg-red-500/15'
                              : 'text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-500/10'
                          }`}
                          aria-label={isRTL ? 'מחק' : 'Delete'}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
