'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  Bell,
  Bookmark,
  CheckCircle,
  Download,
  History,
  LogIn,
  Play,
  PlayCircle,
  Search,
  StickyNote,
  Trash2,
  UserRound,
  Volume2,
  type LucideIcon,
} from 'lucide-react';
import { getLessonsByIds } from '@/actions/lessons';
import { AccountSettings } from '@/components/auth/account-settings';
import { BookmarkGroups } from '@/components/bookmarks/bookmark-groups';
import { NoteImageStrip } from '@/components/notes/note-image-strip';
import { PushToggle } from '@/components/notifications/push-toggle';
import { play, playTrack } from '@/lib/audio-controller';
import { formatFileSize } from '@/lib/audio-utils';
import { createLessonTrack, getLessonAudioAssets, lessonMomentPath } from '@/lib/lesson-tracks';
import { OFFLINE_DOWNLOADS_CHANGED_EVENT } from '@/lib/offline-events';
import { deleteDownloadedLesson, getDownloadedLessons, type OfflineLessonMeta } from '@/lib/offline-storage';
import { getTrackLessonId } from '@/lib/player-track-actions';
import { formatDuration } from '@/lib/utils';
import { useAudioStore } from '@/stores/audio-store';
import { useBookmarksStore } from '@/stores/bookmarks-store';
import { useNotesStore } from '@/stores/notes-store';
import { useProgressStore } from '@/stores/progress-store';
import type { LessonWithRelations } from '@/types/database';

export interface MeAccount {
  email: string;
  displayName: string;
  notifyByEmail: boolean;
  isAdmin: boolean;
}

const CONTINUE_LIMIT = 10;
const HISTORY_LIMIT = 20;
/** Same threshold as the home page: less than this counts as not started. */
const MIN_RESUME_SECONDS = 30;
const CONFIRM_MS = 3000;

const CARD = 'rounded-2xl border border-border/50 bg-[hsl(var(--surface-elevated))]';

function Section({
  id,
  icon: Icon,
  title,
  action,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id={`${id}-title`} className="flex items-center gap-2 text-lg font-bold">
          <Icon className="h-5 w-5 text-primary" />
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <p className={`${CARD} p-4 text-sm leading-relaxed text-muted-foreground`}>{children}</p>;
}

/**
 * The personal library: device-local listening data (progress, bookmarks,
 * notes, offline downloads) for everyone, mirrored to the account for
 * signed-in users, plus notification and account settings.
 */
export default function MeClient({ locale, account }: { locale: string; account: MeAccount | null }) {
  const t = useTranslations('library');
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-US', { dateStyle: 'medium' }),
    [locale],
  );
  const signInHref = `/${locale}/auth/sign-in?next=${encodeURIComponent(`/${locale}/me`)}`;

  // Everything below comes from localStorage/IndexedDB: render it after hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const progressMap = useProgressStore((s) => s.progressMap);
  const bookmarks = useBookmarksStore((s) => s.bookmarks);
  const notes = useNotesStore((s) => s.notes);
  const removeNote = useNotesStore((s) => s.removeNote);
  const currentLessonId = useAudioStore((s) => (s.currentTrack ? getTrackLessonId(s.currentTrack) : null));
  const isPlaying = useAudioStore((s) => s.isPlaying);

  // Two-tap confirmation for destructive actions ("note:<id>", "download:<id>").
  const [confirming, setConfirming] = useState<string | null>(null);
  const confirmThen = (key: string, action: () => void) => {
    if (confirming === key) {
      setConfirming(null);
      action();
      return;
    }
    setConfirming(key);
    setTimeout(() => setConfirming((current) => (current === key ? null : current)), CONFIRM_MS);
  };

  // ---- Listening progress + lesson details ----
  const { inProgress, history } = useMemo(() => {
    const entries = Object.values(progressMap)
      .filter((entry) => entry?.lessonId)
      .sort((a, b) => Date.parse(b.lastPlayed) - Date.parse(a.lastPlayed));
    return {
      inProgress: entries.filter((entry) => !entry.completed && entry.position > MIN_RESUME_SECONDS).slice(0, CONTINUE_LIMIT),
      history: entries.slice(0, HISTORY_LIMIT),
    };
  }, [progressMap]);

  // Sorted id list: the key only changes when another lesson enters the lists.
  const lessonIdsKey = useMemo(
    () => [...new Set([...inProgress, ...history].map((entry) => entry.lessonId))].sort().join(','),
    [inProgress, history],
  );
  const [lessons, setLessons] = useState<Record<string, LessonWithRelations> | null>(null);
  useEffect(() => {
    if (!mounted) return;
    if (!lessonIdsKey) {
      setLessons({});
      return;
    }
    let cancelled = false;
    getLessonsByIds(lessonIdsKey.split(','))
      .then((rows) => {
        if (!cancelled) setLessons(Object.fromEntries(rows.map((lesson) => [lesson.id, lesson])));
      })
      .catch(() => {
        if (!cancelled) setLessons({});
      });
    return () => {
      cancelled = true;
    };
  }, [lessonIdsKey, mounted]);

  /** Resumes the loaded track, or starts the lesson's queue at the saved position. */
  const resume = (lesson: LessonWithRelations, position: number) => {
    if (currentLessonId === lesson.id) {
      play();
      return;
    }
    const tracks = getLessonAudioAssets(lesson).map((asset) => createLessonTrack(lesson, asset));
    if (tracks.length > 0) playTrack(tracks[0], { queue: tracks, queueIndex: 0, startAt: position });
  };

  // ---- Notes ----
  const [noteQuery, setNoteQuery] = useState('');
  const visibleNotes = useMemo(() => {
    const query = noteQuery.trim().toLocaleLowerCase();
    return notes
      .filter(
        (note) =>
          !query ||
          note.body.toLocaleLowerCase().includes(query) ||
          (note.lessonTitle ?? '').toLocaleLowerCase().includes(query),
      )
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }, [notes, noteQuery]);

  // ---- Offline downloads (IndexedDB) ----
  const [downloads, setDownloads] = useState<OfflineLessonMeta[] | null>(null);
  const loadDownloads = useCallback(async () => {
    const saved = await getDownloadedLessons();
    setDownloads(saved.sort((a, b) => Date.parse(b.downloadedAt) - Date.parse(a.downloadedAt)));
  }, []);
  useEffect(() => {
    void loadDownloads();
    const onChange = () => void loadDownloads();
    window.addEventListener(OFFLINE_DOWNLOADS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(OFFLINE_DOWNLOADS_CHANGED_EVENT, onChange);
  }, [loadDownloads]);
  const downloadedBytes = downloads?.reduce((sum, lesson) => sum + lesson.fileSize, 0) ?? 0;

  const sections = [
    { id: 'continue', label: t('sections.continue') },
    { id: 'history', label: t('sections.history') },
    { id: 'bookmarks', label: t('sections.bookmarks') },
    { id: 'notes', label: t('sections.notes') },
    { id: 'downloads', label: t('sections.downloads') },
    { id: 'notifications', label: t('sections.notifications') },
    { id: 'account', label: t('sections.account') },
  ];
  const loading = <Muted>{t('loading')}</Muted>;
  const lessonTitle = (lesson: LessonWithRelations) => lesson.hebrew_title || lesson.title;

  return (
    <div className="mx-auto max-w-2xl space-y-8 pb-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">
          {account
            ? t.rich('greeting', {
                name: account.displayName || account.email,
                bdi: (chunks) => <bdi>{chunks}</bdi>,
              })
            : t('subtitle')}
        </p>
      </header>

      {!account && (
        <div className={`${CARD} flex flex-col gap-3 p-4 sm:flex-row sm:items-center`}>
          <div className="flex-1 space-y-1">
            <p className="text-sm font-bold">{t('signInCta.title')}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">{t('signInCta.body')}</p>
          </div>
          <Link
            href={signInHref}
            className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90"
          >
            <LogIn className="h-4 w-4 rtl:-scale-x-100" />
            {t('signInCta.button')}
          </Link>
        </div>
      )}

      <nav aria-label={t('sectionsNav')} className="-mx-4 overflow-x-auto px-4">
        <ul className="flex gap-2">
          {sections.map((section) => (
            <li key={section.id} className="shrink-0">
              <a
                href={`#${section.id}`}
                className="block rounded-full bg-[hsl(var(--surface-elevated))] px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-[hsl(var(--surface-highlight))] hover:text-foreground"
              >
                {section.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* ---- Continue listening ---- */}
      <Section id="continue" icon={PlayCircle} title={t('sections.continue')}>
        {!mounted || (inProgress.length > 0 && lessons === null) ? (
          loading
        ) : inProgress.filter((entry) => lessons?.[entry.lessonId]).length === 0 ? (
          <Muted>{t('continue.empty')}</Muted>
        ) : (
          <ul className="space-y-2">
            {inProgress.map((entry) => {
              const lesson = lessons?.[entry.lessonId];
              if (!lesson) return null;
              const total = lesson.duration || getLessonAudioAssets(lesson)[0]?.duration || 0;
              const percent = total > 0 ? Math.min(100, Math.round((entry.position / total) * 100)) : 0;
              const nowPlaying = currentLessonId === lesson.id && isPlaying;
              return (
                <li key={lesson.id} className={`${CARD} space-y-3 p-4`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/${locale}/lessons/${lesson.id}`}
                        className="line-clamp-2 text-sm font-bold hover:underline"
                        dir="auto"
                      >
                        {lessonTitle(lesson)}
                      </Link>
                      {(lesson.series?.hebrew_name || lesson.series?.name) && (
                        <p className="truncate text-xs text-muted-foreground" dir="auto">
                          {lesson.series?.hebrew_name || lesson.series?.name}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => resume(lesson, entry.position)}
                      disabled={nowPlaying}
                      className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:bg-primary/20 disabled:text-primary"
                    >
                      {nowPlaying ? (
                        <>
                          <Volume2 className="h-3.5 w-3.5 animate-pulse" />
                          {t('continue.playing')}
                        </>
                      ) : (
                        <>
                          <Play className="h-3.5 w-3.5 fill-current" />
                          {t.rich('continue.resume', {
                            time: formatDuration(entry.position),
                            bdi: (chunks) => <bdi dir="ltr">{chunks}</bdi>,
                          })}
                        </>
                      )}
                    </button>
                  </div>
                  {total > 0 && (
                    <div className="space-y-1">
                      <div
                        className="h-1.5 overflow-hidden rounded-full bg-[hsl(var(--surface-highlight))]"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={percent}
                        aria-label={lessonTitle(lesson)}
                      >
                        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                      </div>
                      <div className="flex justify-between text-[11px] text-muted-foreground">
                        <bdi dir="ltr" className="tabular-nums">
                          {formatDuration(entry.position)} / {formatDuration(total)}
                        </bdi>
                        <span>
                          {t('continue.remaining', { time: formatDuration(Math.max(0, total - entry.position)) })}
                        </span>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* ---- Listening history ---- */}
      <Section id="history" icon={History} title={t('sections.history')}>
        {!mounted || (history.length > 0 && lessons === null) ? (
          loading
        ) : history.filter((entry) => lessons?.[entry.lessonId]).length === 0 ? (
          <Muted>{t('history.empty')}</Muted>
        ) : (
          <ul className={`${CARD} divide-y divide-border/40`}>
            {history.map((entry) => {
              const lesson = lessons?.[entry.lessonId];
              if (!lesson) return null;
              const total = lesson.duration || getLessonAudioAssets(lesson)[0]?.duration || 0;
              const percent = total > 0 ? Math.min(100, Math.round((entry.position / total) * 100)) : null;
              return (
                <li key={lesson.id}>
                  <Link
                    href={`/${locale}/lessons/${lesson.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-[hsl(var(--surface-highlight))]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium" dir="auto">
                        {lessonTitle(lesson)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {t('history.lastPlayed', { date: dateFormat.format(new Date(entry.lastPlayed)) })}
                      </p>
                    </div>
                    {entry.completed ? (
                      <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-green-400">
                        <CheckCircle className="h-4 w-4" />
                        {t('history.completed')}
                      </span>
                    ) : (
                      percent !== null && (
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {t('history.percent', { percent })}
                        </span>
                      )
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* ---- Bookmarks ---- */}
      <Section
        id="bookmarks"
        icon={Bookmark}
        title={t('sections.bookmarks')}
        action={
          mounted && bookmarks.length > 0 ? (
            <Link href={`/${locale}/bookmarks`} className="text-xs font-medium text-primary hover:underline">
              {t('bookmarks.viewAll')}
            </Link>
          ) : null
        }
      >
        {!mounted ? (
          loading
        ) : bookmarks.length === 0 ? (
          <Muted>{t('bookmarks.empty')}</Muted>
        ) : (
          <BookmarkGroups bookmarks={bookmarks} locale={locale} />
        )}
      </Section>

      {/* ---- Notes ---- */}
      <Section
        id="notes"
        icon={StickyNote}
        title={t('sections.notes')}
        action={
          mounted && notes.length > 0 ? (
            <span className="text-xs text-muted-foreground">{t('notes.count', { count: notes.length })}</span>
          ) : null
        }
      >
        {!mounted ? (
          loading
        ) : notes.length === 0 ? (
          <Muted>{t('notes.emptyLibrary')}</Muted>
        ) : (
          <div className="space-y-3">
            <label className="relative block">
              <span className="sr-only">{t('notes.search')}</span>
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={noteQuery}
                onChange={(event) => setNoteQuery(event.target.value)}
                placeholder={t('notes.search')}
                dir="auto"
                className="w-full rounded-xl border border-border/50 bg-[hsl(var(--surface-elevated))] py-2.5 pe-3 ps-9 text-sm placeholder:text-muted-foreground focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>

            {visibleNotes.length === 0 ? (
              <Muted>{t('notes.noResults')}</Muted>
            ) : (
              <ul className="space-y-2">
                {visibleNotes.map((note) => {
                  const confirmKey = `note:${note.id}`;
                  return (
                    <li key={note.id} className={`${CARD} space-y-2 p-4`}>
                      <div className="flex items-center justify-between gap-3">
                        <Link
                          href={`/${locale}/lessons/${note.lessonId}`}
                          className="min-w-0 truncate text-xs font-bold text-primary hover:underline"
                          dir="auto"
                        >
                          {note.lessonTitle || t('lessonFallback')}
                        </Link>
                        {note.position !== null && (
                          <Link
                            href={`/${locale}${lessonMomentPath(note.lessonId, note.position, note.audioFileId)}`}
                            className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-bold text-primary hover:bg-primary/20"
                            aria-label={t('notes.playFrom', { time: formatDuration(note.position) })}
                          >
                            <Play className="h-2.5 w-2.5 fill-current" />
                            <bdi dir="ltr">{formatDuration(note.position)}</bdi>
                          </Link>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed" dir="auto">
                        {note.body}
                      </p>
                      <NoteImageStrip images={note.images} />
                      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span>{dateFormat.format(new Date(note.updatedAt))}</span>
                        <button
                          type="button"
                          onClick={() => confirmThen(confirmKey, () => void removeNote(note.id))}
                          className={`flex items-center gap-1 rounded p-1 transition-colors ${
                            confirming === confirmKey
                              ? 'bg-red-500/15 text-red-400'
                              : 'hover:bg-red-500/10 hover:text-red-400'
                          }`}
                          aria-label={confirming === confirmKey ? t('notes.confirmDelete') : t('notes.delete')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {confirming === confirmKey && <span>{t('notes.confirmDelete')}</span>}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </Section>

      {/* ---- Offline downloads ---- */}
      <Section
        id="downloads"
        icon={Download}
        title={t('sections.downloads')}
        action={
          <Link href={`/${locale}/offline`} className="text-xs font-medium text-primary hover:underline">
            {t('downloads.openOffline')}
          </Link>
        }
      >
        {downloads === null ? (
          loading
        ) : downloads.length === 0 ? (
          <Muted>{t('downloads.empty')}</Muted>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {t('downloads.summary', { count: downloads.length, size: formatFileSize(downloadedBytes) })}
            </p>
            <ul className={`${CARD} divide-y divide-border/40`}>
              {downloads.map((lesson) => {
                const confirmKey = `download:${lesson.lessonId}`;
                return (
                  <li key={lesson.lessonId} className="flex items-center gap-3 px-4 py-3">
                    <Link href={`/${locale}/lessons/${lesson.lessonId}`} className="min-w-0 flex-1 hover:underline">
                      <p className="truncate text-sm font-medium" dir="auto">
                        {lesson.hebrewTitle || lesson.title}
                      </p>
                      <bdi dir="ltr" className="text-[11px] text-muted-foreground">
                        {formatFileSize(lesson.fileSize)}
                      </bdi>
                    </Link>
                    <button
                      type="button"
                      onClick={() => confirmThen(confirmKey, () => void deleteDownloadedLesson(lesson.lessonId))}
                      className={`flex shrink-0 items-center gap-1 rounded-full p-2 text-xs transition-colors ${
                        confirming === confirmKey
                          ? 'bg-red-500/15 text-red-400'
                          : 'text-muted-foreground hover:bg-red-500/10 hover:text-red-400'
                      }`}
                      aria-label={t('downloads.remove')}
                    >
                      <Trash2 className="h-4 w-4" />
                      {confirming === confirmKey && <span>{t('downloads.remove')}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Section>

      {/* ---- Notifications + account ---- */}
      {account ? (
        <AccountSettings
          locale={locale}
          email={account.email}
          initialDisplayName={account.displayName}
          initialNotifyByEmail={account.notifyByEmail}
          isAdmin={account.isAdmin}
        />
      ) : (
        <>
          <Section id="notifications" icon={Bell} title={t('sections.notifications')}>
            <div className={`${CARD} space-y-3 p-4`}>
              <PushToggle />
              <p className="border-t border-border/40 pt-3 text-xs leading-relaxed text-muted-foreground">
                {t('notifications.emailNeedsAccount')}
              </p>
            </div>
          </Section>
          <Section id="account" icon={UserRound} title={t('sections.account')}>
            <div className={`${CARD} space-y-3 p-4`}>
              <p className="text-sm leading-relaxed text-muted-foreground">{t('signInCta.body')}</p>
              <Link
                href={signInHref}
                className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90"
              >
                <LogIn className="h-4 w-4 rtl:-scale-x-100" />
                {t('signInCta.button')}
              </Link>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
