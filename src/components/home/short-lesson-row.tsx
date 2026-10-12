'use client';

import { lessonPath } from '@/config/site';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { AudioLines } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { getLessonPartSeconds, getLessonTracks } from '@/lib/lesson-tracks';
import { PartDurations } from '@/components/lessons/part-durations';
import { LessonPlayButton, useLessonPlayback } from '@/components/lessons/lesson-play-button';
import type { LessonWithRelations } from '@/types/database';

/** A short clip in the quiet "קצרים" list: rose accent, the whole row opens the lesson. */
export function ShortLessonRow({ lesson }: { lesson: LessonWithRelations }) {
  const t = useTranslations('player');
  const tracks = useMemo(() => getLessonTracks(lesson), [lesson]);
  const partSeconds = useMemo(() => getLessonPartSeconds(lesson), [lesson]);
  const { playing } = useLessonPlayback(lesson.id);
  const title = lesson.hebrew_title || lesson.title;

  return (
    <li
      className={`group/short relative flex items-center gap-3 rounded-2xl p-2 transition-colors duration-150 hover:bg-[hsl(var(--surface-elevated))] has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-primary/50 motion-reduce:transition-none lg:[@media(hover:hover)]:hover:bg-[hsl(var(--surface-highlight))] ${playing ? 'bg-[hsl(350_70%_50%/0.08)]' : ''}`}
    >
      <span
        aria-hidden="true"
        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[hsl(350_70%_50%/0.14)] text-rose-400"
      >
        <AudioLines className="h-5 w-5" />
      </span>

      <div className="grid min-w-0 flex-1 gap-1">
        <h3 className={`text-[15px] font-semibold leading-snug ${playing ? 'text-rose-400' : 'text-foreground'}`}>
          <Link
            href={lessonPath(lesson)}
            dir="auto"
            className="line-clamp-2 before:absolute before:inset-0 before:content-[''] focus-visible:outline-none"
          >
            {title}
          </Link>
        </h3>
        <PartDurations seconds={partSeconds} className="text-[13px] text-muted-foreground" />
      </div>

      <LessonPlayButton
        lessonId={lesson.id}
        tracks={tracks}
        playLabel={t('play')}
        pauseLabel={t('pause')}
        className="hover:bg-rose-400/12 h-11 w-11 border border-rose-400/35 text-rose-400"
        iconClassName="h-4 w-4 fill-current"
      />
    </li>
  );
}
