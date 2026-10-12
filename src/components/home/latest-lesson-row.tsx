'use client';

import { lessonPath } from '@/config/site';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { useHydrated } from '@/hooks/use-hydrated';
import { getLessonPartSeconds, getLessonTracks } from '@/lib/lesson-tracks';
import { getListenedFraction } from '@/lib/lesson-progress';
import { hebrewDayMonth, readingHue } from '@/lib/lesson-display';
import { parshaLabel } from '@/lib/parsha-label';
import { useProgressStore } from '@/stores/progress-store';
import { LessonDateLink, LessonTagList } from '@/components/lessons/lesson-browse-links';
import { LessonPlayButton } from '@/components/lessons/lesson-play-button';
import { PartDurations } from '@/components/lessons/part-durations';
import type { LessonWithRelations } from '@/types/database';

/** One lesson in "שיעורים אחרונים": date tile, title, reading, parts, tags, progress, play. */
export function LatestLessonRow({ lesson }: { lesson: LessonWithRelations }) {
  const t = useTranslations('player');
  const hydrated = useHydrated();
  const tracks = useMemo(() => getLessonTracks(lesson), [lesson]);
  const partSeconds = useMemo(() => getLessonPartSeconds(lesson), [lesson]);
  const saved = useProgressStore((s) => s.progressMap[lesson.id]);

  // Device-only progress: shown after hydration so the server HTML matches.
  const heard = hydrated && saved?.completed === true;
  const progress = hydrated && !heard ? Math.round(getListenedFraction(tracks, saved) * 100) : 0;

  const hue = readingHue(lesson.parsha || lesson.id);
  const dayMonth = hebrewDayMonth(lesson.hebrew_date);
  const fallbackDay = lesson.date.slice(8, 10);
  const fallbackMonth = lesson.date.slice(5, 7);
  const title = lesson.hebrew_title || lesson.title;
  const reading = lesson.parsha ? parshaLabel(lesson.parsha) : null;

  return (
    <article className="group relative flex items-center gap-3 rounded-2xl p-2.5 transition-colors duration-150 hover:bg-[hsl(var(--surface-elevated))] has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-primary/50 motion-reduce:transition-none sm:p-3">
      {/* The tile is the date link: a sibling of the title link, never nested. */}
      <LessonDateLink
        date={lesson.date}
        hebrewDate={lesson.hebrew_date}
        className="h-[58px] w-[52px] flex-shrink-0 flex-col justify-center gap-0.5 rounded-xl px-0 hover:no-underline"
      >
        <span
          className="flex h-full w-full flex-col items-center justify-center rounded-xl border text-center"
          style={{
            background: `linear-gradient(150deg, hsl(${hue} 40% 24%), hsl(${hue} 25% 14%))`,
            borderColor: `hsl(${hue} 40% 40% / 0.35)`,
          }}
        >
          <b className="text-[19px] leading-none" style={{ color: `hsl(${hue} 75% 82%)` }}>
            {dayMonth?.day ?? fallbackDay}
          </b>
          <span className="text-[13px] leading-tight" style={{ color: `hsl(${hue} 30% 74%)` }}>
            {dayMonth?.month ?? fallbackMonth}
          </span>
        </span>
      </LessonDateLink>

      <div className="grid min-w-0 flex-1 gap-1.5">
        <h3 className="text-base font-bold leading-snug text-foreground">
          <Link
            href={lessonPath(lesson)}
            dir="auto"
            className="line-clamp-2 before:absolute before:inset-0 before:content-[''] focus-visible:outline-none"
          >
            {title}
          </Link>
        </h3>

        {(reading || heard) && (
          <p className="flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground">
            {reading && (
              <span className="truncate font-semibold" dir="rtl" style={{ color: `hsl(${hue} 65% 74%)` }}>
                {reading}
              </span>
            )}
            {heard && (
              <span className="inline-flex flex-shrink-0 items-center gap-1 font-semibold text-primary">
                <Check aria-hidden="true" className="h-3.5 w-3.5" />
                {t('heard')}
              </span>
            )}
          </p>
        )}

        <PartDurations variant="chips" seconds={partSeconds} />

        <LessonTagList tags={lesson.tags} />

        {progress > 0 && (
          <span
            className="mt-0.5 block h-[3px] max-w-[260px] overflow-hidden rounded-full bg-foreground/12"
            role="progressbar"
            aria-label={title}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <span className="block h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
          </span>
        )}
      </div>

      <LessonPlayButton
        lessonId={lesson.id}
        tracks={tracks}
        playLabel={t('play')}
        pauseLabel={t('pause')}
        className="h-11 w-11 self-center bg-[hsl(var(--surface-highlight))] text-foreground hover:bg-primary hover:text-primary-foreground"
        iconClassName="h-4 w-4 translate-x-[6%] fill-current"
      />
    </article>
  );
}
