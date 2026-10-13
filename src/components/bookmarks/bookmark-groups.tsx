'use client';

import type { LessonWithRelations } from '@/types/database';
import { lessonPath } from '@/config/site';

import { useState } from 'react';
import { Clock, Pencil, Play, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { BookmarkDialog, getTagInfo, useBookmarkSavedNotice } from '@/components/bookmarks/bookmark-dialog';
import { CardGrid } from '@/components/shared/card-grid';
import { CoverTile, readingCoverOf } from '@/components/lessons/reading-cover';
import { Link } from '@/i18n/routing';
import { lessonMomentPath } from '@/lib/lesson-tracks';
import { readingHue } from '@/lib/lesson-display';
import { formatDuration } from '@/lib/utils';
import type { LocalBookmark } from '@/stores/bookmarks-store';
import { useBookmarksStore } from '@/stores/bookmarks-store';

/** Tag pill colours: one per bookmark tag (important, review, quote, else). */
function tagPillClass(value: string): string {
  if (value === 'important') return 'bg-red-500/15 text-red-400';
  if (value === 'review') return 'bg-amber-500/15 text-amber-400';
  if (value === 'quote') return 'bg-blue-500/15 text-blue-400';
  return 'bg-purple-500/15 text-purple-400';
}

/**
 * Bookmarks grouped by lesson (most recent lesson first). Each lesson is a card with its
 * cover and title (linking to the lesson), and its bookmarks as rows: a time chip that
 * opens the lesson at that moment (`?t=`), the tag, the note and the date. Editing opens
 * the bookmark dialog in edit mode (it never plays the lesson). Deleting asks for a second
 * tap. Groups sit in the rows grid, so a wide pane shows two or three side by side.
 */
export function BookmarkGroups({
  bookmarks,
  locale,
  lessons,
}: {
  bookmarks: LocalBookmark[];
  locale: string;
  lessons?: Record<string, LessonWithRelations> | null;
}) {
  const removeBookmark = useBookmarksStore((s) => s.removeBookmark);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [editing, setEditing] = useState<LocalBookmark | null>(null);
  const te = useTranslations('bookmarkEdit');
  const tDesign = useTranslations('pagesDesign');
  const saved = useBookmarkSavedNotice();
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
    <div className="space-y-4">
      <CardGrid variant="rows" className="gap-y-3">
        {sortedGroups.map(([lessonId, lessonBookmarks]) => {
          const sorted = [...lessonBookmarks].sort((a, b) => a.position - b.position);
          const lesson = lessons?.[lessonId];
          const storedTitle = lessonBookmarks.find((bm) => bm.lessonTitle)?.lessonTitle;
          const lessonTitle = storedTitle || (lesson && (lesson.hebrew_title || lesson.title));
          const title = lessonTitle || tDesign('bookmarks.lessonFallback');
          const cover = lesson ? readingCoverOf(lesson) : { text: '', hue: readingHue(lessonId) };

          return (
            <section
              key={lessonId}
              aria-label={title}
              className="flex min-w-0 flex-col gap-2 rounded-2xl bg-[hsl(var(--surface-elevated))] p-3 sm:p-4"
            >
              <header className="flex items-center gap-3">
                <CoverTile text={cover.text} hue={cover.hue} className="h-12 w-12" textClassName="text-sm" />
                <div className="min-w-0 flex-1">
                  <h3 className="min-w-0">
                    <Link
                      href={lessonPath(lesson ?? lessonId)}
                      dir="auto"
                      className="line-clamp-2 rounded text-[15px] font-bold leading-snug text-foreground transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                    >
                      {title}
                    </Link>
                  </h3>
                  {lesson && (
                    <p className="truncate text-[13px] text-muted-foreground" dir="auto">
                      {lesson.hebrew_date || lesson.date}
                    </p>
                  )}
                </div>
              </header>

              <ul className="space-y-1">
                {sorted.map((bm) => {
                  const tagInfo = getTagInfo(bm.tag);
                  const isConfirming = confirmDelete === bm.id;
                  const time = formatDuration(Math.round(bm.position));

                  return (
                    <li
                      key={bm.id}
                      className="group flex items-start gap-2 rounded-xl p-1.5 transition-colors duration-150 hover:bg-[hsl(var(--surface-highlight))] motion-reduce:transition-none"
                    >
                      <Link
                        href={lessonMomentPath(lessons?.[bm.lessonId] ?? bm.lessonId, bm.position, bm.audioFileId)}
                        className="inline-flex min-h-11 flex-shrink-0 items-center gap-1.5 rounded-full bg-primary/15 px-3 text-primary transition-colors hover:bg-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                      >
                        <Play aria-hidden="true" className="h-3.5 w-3.5 fill-current" />
                        <bdi dir="ltr" className="font-mono text-[13px] font-bold tabular-nums">
                          {time}
                        </bdi>
                      </Link>

                      <div className="min-w-0 flex-1 space-y-1 py-1">
                        {tagInfo && (
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tagPillClass(tagInfo.value)}`}
                          >
                            {isRTL ? tagInfo.label : tagInfo.labelEn}
                          </span>
                        )}
                        {bm.note && (
                          <p className="text-sm leading-relaxed text-foreground" dir="auto">
                            {bm.note}
                          </p>
                        )}
                        <p className="flex items-center gap-1 text-[13px] text-muted-foreground">
                          <Clock aria-hidden="true" className="h-3.5 w-3.5" />
                          {new Date(bm.createdAt).toLocaleDateString(isRTL ? 'he-IL' : 'en-US')}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          // Focus the button first so focus returns here when the dialog closes (Safari does not focus on tap).
                          e.currentTarget.focus();
                          setEditing(bm);
                        }}
                        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 group-hover:opacity-100 motion-reduce:transition-none [@media(hover:hover)]:opacity-0"
                        aria-label={te('editBookmark', { time })}
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(bm.id)}
                        className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 motion-reduce:transition-none ${
                          isConfirming
                            ? 'bg-red-500/15 text-red-400'
                            : 'text-muted-foreground hover:bg-red-500/10 hover:text-red-400 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:opacity-0'
                        }`}
                        aria-label={isRTL ? 'מחק' : 'Delete'}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </CardGrid>
      <div role="status" aria-live="polite">
        {saved.text && <p className="text-[13px] font-medium text-emerald-300">{saved.text}</p>}
      </div>
      {editing && (
        <BookmarkDialog key={editing.id} bookmark={editing} onClose={() => setEditing(null)} onSaved={saved.onSaved} />
      )}
    </div>
  );
}
