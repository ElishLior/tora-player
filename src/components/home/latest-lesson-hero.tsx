'use client';

import { lessonPath } from '@/config/site';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, CheckCircle, Download, FileDown, Loader2 } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { useHydrated } from '@/hooks/use-hydrated';
import { useIsDownloaded } from '@/hooks/use-offline';
import { getResumePoint } from '@/lib/lesson-progress';
import { getLessonPartSeconds, getLessonTracks } from '@/lib/lesson-tracks';
import { playLesson } from '@/lib/play-lesson';
import { parshaLabel } from '@/lib/parsha-label';
import { ReadingCover } from '@/components/lessons/reading-cover';
import { cn, formatDuration } from '@/lib/utils';
import { saveAudioFilesOffline } from '@/lib/offline-storage';
import { handleDeviceDownloadClick } from '@/lib/device-download';
import {
  getTrackDownloadFilename,
  getTrackDownloadUrl,
  getTrackOfflineDownloadInput,
  getTrackOfflineLessonInput,
} from '@/lib/player-track-actions';
import { useProgressStore } from '@/stores/progress-store';
import { isNewSince, useVisitStore } from '@/stores/visit-store';
import { LessonDateLink, LessonSeriesLink, LessonTagList } from '@/components/lessons/lesson-browse-links';
import { LessonPlayButton, useLessonPlayback } from '@/components/lessons/lesson-play-button';
import { PartDurations } from '@/components/lessons/part-durations';
import { ShareButton } from '@/components/shared/share-button';
import type { LessonWithRelations } from '@/types/database';

interface LatestLessonHeroProps {
  /** The small line above the title, e.g. "השיעור של היום". */
  eyebrow: string;
  lesson: LessonWithRelations;
  /** Layout hook: the home page's desktop order. */
  className?: string;
}

const BACKDROP: React.CSSProperties = {
  background:
    'radial-gradient(120% 80% at 100% 0%, hsl(145 55% 28% / 0.55) 0%, transparent 60%), radial-gradient(70% 60% at 0% 65%, hsl(38 85% 42% / 0.22) 0%, transparent 70%), linear-gradient(180deg, hsl(152 35% 14%) 0%, hsl(0 0% 9%) 100%)',
};

const iconButton =
  'relative z-10 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-foreground/85 transition-colors hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-60 motion-reduce:transition-none';

/**
 * "השיעור של היום": the newest lesson as the page's hero. The whole card opens
 * the lesson page (stretched title link); the series and date links, the play
 * button, the part chips, the tags and the actions are siblings of that link,
 * never nested inside it. The reading cover tile is decorative (aria-hidden).
 * Device-only state renders after hydration.
 */
export function LatestLessonHero({ eyebrow, lesson, className }: LatestLessonHeroProps) {
  const t = useTranslations('player');
  const tShell = useTranslations('desktopShell');
  const hydrated = useHydrated();
  const tracks = useMemo(() => getLessonTracks(lesson), [lesson]);
  const partSeconds = useMemo(() => getLessonPartSeconds(lesson), [lesson]);
  const saved = useProgressStore((s) => s.progressMap[lesson.id]);
  const { isCurrent } = useLessonPlayback(lesson.id);
  const previousVisitAt = useVisitStore((s) => s.previousVisitAt);
  const isOffline = useIsDownloaded(lesson.id);
  const [savedNow, setSavedNow] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'error'>('idle');
  const [saveProgress, setSaveProgress] = useState(0);

  if (tracks.length === 0) return null;

  // Device-only state: read after hydration so the server HTML matches.
  const resume = hydrated ? getResumePoint(tracks, saved) : { index: 0, position: 0 };
  const hasResume = resume.index > 0 || resume.position > 0;
  const isNew = hydrated && !saved && isNewSince(lesson.created_at, previousVisitAt);
  const offlineSaved = isOffline || savedNow;
  const reading = lesson.parsha ? parshaLabel(lesson.parsha) : null;
  const playLabel =
    isCurrent || !hasResume
      ? t('play')
      : tracks.length > 1
        ? t('resumePart', { number: resume.index + 1, time: formatDuration(resume.position) })
        : t('resumeAt', { time: formatDuration(resume.position) });
  const single = tracks.length === 1 ? tracks[0] : null;
  const title = lesson.hebrew_title || lesson.title;

  const handleSaveOffline = async () => {
    if (offlineSaved || saveState === 'saving') return;
    setSaveState('saving');
    setSaveProgress(0);
    const result = await saveAudioFilesOffline(
      lesson.id,
      tracks.map(getTrackOfflineDownloadInput),
      getTrackOfflineLessonInput(tracks[0]),
      setSaveProgress,
    );
    if (result.ok) {
      setSavedNow(true);
      setSaveState('idle');
    } else {
      setSaveState('error');
      window.setTimeout(() => setSaveState('idle'), 5000);
    }
  };

  return (
    <section aria-labelledby={`hero-${lesson.id}`} className={cn('relative isolate rounded-3xl p-5 lg:p-8', className)}>
      {/* Backdrop: clipped here so the share menu is not. The reading shows on the cover tile. */}
      <div aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden rounded-3xl" style={BACKDROP} />

      <div className="flex items-stretch gap-4 lg:gap-8">
        <div className="grid min-w-0 flex-1 content-start gap-4">
          <div className="grid min-h-16 content-start gap-3 pe-20 min-[360px]:min-h-20 min-[360px]:pe-24 lg:min-h-0 lg:gap-4 lg:pe-0">
            <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap">
              <p className="flex items-center gap-2 text-[13px] font-bold tracking-wide text-[hsl(48_90%_82%)]">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full bg-[hsl(45_95%_62%)] motion-safe:animate-pulse"
                />
                {eyebrow}
              </p>
              {isNew && (
                <span className="rounded-full bg-primary px-2 py-0.5 text-[13px] font-extrabold text-primary-foreground">
                  {t('newBadge')}
                </span>
              )}
            </div>

            <h2
              id={`hero-${lesson.id}`}
              className="text-[22px] font-extrabold leading-tight tracking-tight text-foreground min-[360px]:text-[26px] lg:text-[32px]"
            >
              <Link
                href={lessonPath(lesson)}
                dir="auto"
                className="before:absolute before:inset-0 before:content-[''] hover:underline focus-visible:outline-none"
              >
                {title}
              </Link>
            </h2>
          </div>

          {/* Date · part count · reading, then the series link. Each is a sibling of the stretched title link. */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              <LessonDateLink
                date={lesson.date}
                hebrewDate={lesson.hebrew_date}
                className="text-sm text-foreground/75"
              />
              <span aria-hidden="true" className="text-foreground/40">
                ·
              </span>
              <span className="text-sm text-foreground/75">{tShell('partsCount', { count: tracks.length })}</span>
            </span>
            {reading && (
              <span className="bg-foreground/12 rounded-full px-2.5 py-0.5 font-bold text-foreground" dir="rtl">
                {reading}
              </span>
            )}
            {lesson.series && (
              <LessonSeriesLink
                seriesId={lesson.series.id}
                name={lesson.series.hebrew_name || lesson.series.name}
                className="text-sm font-semibold text-primary"
              />
            )}
          </div>

          {/* Each chip starts its own part, even when the listener's saved place is elsewhere. The part already loaded keeps its live position (resuming never seeks). */}
          <PartDurations
            variant="chips"
            seconds={partSeconds}
            onPlayPart={(index) => playLesson(tracks, { startPart: index })}
            className="max-lg:grid max-lg:grid-cols-[repeat(auto-fit,minmax(7.25rem,1fr))] max-lg:[&>button]:justify-center max-lg:[&>button]:gap-1 max-lg:[&>button]:px-1.5"
          />

          <LessonTagList tags={lesson.tags} />

          <div className="mt-1 flex items-center gap-2">
            <LessonPlayButton
              lessonId={lesson.id}
              tracks={tracks}
              playLabel={playLabel}
              pauseLabel={t('pause')}
              className="h-16 w-16 bg-primary text-primary-foreground shadow-[0_10px_30px_-8px_hsl(141_73%_42%/0.6)] hover:bg-primary/90"
              iconClassName="h-7 w-7"
            />

            <div className="ms-auto flex items-center">
              <ShareButton
                lessonId={lesson.id}
                lessonSlug={lesson.slug}
                title={title}
                variant="icon"
                className={iconButton}
              />
              <button
                type="button"
                onClick={() => void handleSaveOffline()}
                disabled={offlineSaved || saveState === 'saving'}
                aria-label={offlineSaved ? t('savedOffline') : t('saveOffline')}
                className={iconButton}
              >
                {saveState === 'saving' ? (
                  <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
                ) : offlineSaved ? (
                  <CheckCircle aria-hidden="true" className="h-5 w-5 text-primary" />
                ) : (
                  <Download aria-hidden="true" className="h-5 w-5" />
                )}
                {saveState === 'saving' && <span className="sr-only">{saveProgress}%</span>}
              </button>
              {/* One file per part: the single-part download sits here; multi-part lessons keep per-part downloads on the lesson page. */}
              {single && (
                <a
                  href={getTrackDownloadUrl(single)}
                  download={getTrackDownloadFilename(single)}
                  onClick={(event) =>
                    handleDeviceDownloadClick(event, {
                      lessonId: lesson.id,
                      offlineKey: single.offlineKey,
                      audioUrl: single.audioUrl,
                      filename: getTrackDownloadFilename(single),
                      savedOffline: offlineSaved,
                    })
                  }
                  aria-label={t('downloadToDevice')}
                  className={iconButton}
                >
                  <FileDown aria-hidden="true" className="h-5 w-5" />
                </a>
              )}
            </div>
          </div>

          {hasResume && !isCurrent && (
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-primary">
              <Check aria-hidden="true" className="h-3.5 w-3.5" />
              {playLabel}
            </p>
          )}
        </div>

        {/* Reserve the cover's space beside the heading on mobile; controls use the full width below it. */}
        <ReadingCover
          lesson={lesson}
          className="pointer-events-none absolute end-5 top-5 h-16 w-16 min-[360px]:h-20 min-[360px]:w-20 lg:static lg:h-56 lg:w-56 xl:h-60 xl:w-60"
          textClassName="text-[28px] min-[360px]:text-[34px] lg:text-[56px]"
        />
      </div>
    </section>
  );
}
