'use client';

import { useState } from 'react';
import { Clock, Play, Trash2 } from 'lucide-react';
import { getTagInfo } from '@/components/bookmarks/bookmark-dialog';
import { Link } from '@/i18n/routing';
import { lessonMomentPath } from '@/lib/lesson-tracks';
import { formatDuration } from '@/lib/utils';
import type { LocalBookmark } from '@/stores/bookmarks-store';
import { useBookmarksStore } from '@/stores/bookmarks-store';

/**
 * Bookmarks grouped by lesson (most recent lesson first), each linking into
 * the lesson at its position (`?t=`). Deleting asks for a second tap.
 */
export function BookmarkGroups({ bookmarks, locale }: { bookmarks: LocalBookmark[]; locale: string }) {
  const removeBookmark = useBookmarksStore((s) => s.removeBookmark);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const isRTL = locale === 'he';

  const grouped = bookmarks.reduce<Record<string, LocalBookmark[]>>((acc, bm) => {
    (acc[bm.lessonId] ??= []).push(bm);
    return acc;
  }, {});

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
    <div className="space-y-6">
      {sortedGroups.map(([lessonId, lessonBookmarks]) => {
        const sorted = [...lessonBookmarks].sort((a, b) => a.position - b.position);
        const lessonTitle = lessonBookmarks.find((bm) => bm.lessonTitle)?.lessonTitle;

        return (
          <div key={lessonId} className="space-y-2">
            <Link
              href={`/lessons/${lessonId}`}
              className="text-sm font-bold text-primary hover:underline truncate block"
              dir="auto"
            >
              {lessonTitle || `${isRTL ? 'שיעור' : 'Lesson'} - ${lessonId.slice(0, 8)}...`}
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
                    <Link
                      href={lessonMomentPath(bm.lessonId, bm.position, bm.audioFileId)}
                      className="flex items-center gap-1.5 text-primary hover:text-primary/80 flex-shrink-0 mt-0.5"
                    >
                      <Play className="h-3.5 w-3.5 fill-current" />
                      <bdi dir="ltr" className="text-xs font-mono font-bold">
                        {formatDuration(Math.round(bm.position))}
                      </bdi>
                    </Link>

                    <div className="flex-1 min-w-0 space-y-1">
                      {tagInfo && (
                        <span
                          className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full ${
                            tagInfo.value === 'important'
                              ? 'bg-red-500/15 text-red-400'
                              : tagInfo.value === 'review'
                                ? 'bg-amber-500/15 text-amber-400'
                                : tagInfo.value === 'quote'
                                  ? 'bg-blue-500/15 text-blue-400'
                                  : 'bg-purple-500/15 text-purple-400'
                          }`}
                        >
                          {isRTL ? tagInfo.label : tagInfo.labelEn}
                        </span>
                      )}
                      {bm.note && (
                        <p className="text-sm text-foreground leading-relaxed" dir="auto">
                          {bm.note}
                        </p>
                      )}
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {new Date(bm.createdAt).toLocaleDateString(isRTL ? 'he-IL' : 'en-US')}
                      </div>
                    </div>

                    <button
                      onClick={() => handleDelete(bm.id)}
                      className={`p-1.5 rounded-full transition-colors flex-shrink-0 ${
                        isConfirming
                          ? 'text-red-400 bg-red-500/15'
                          : 'text-muted-foreground [@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-red-400 hover:bg-red-500/10'
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
  );
}
