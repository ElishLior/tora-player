'use client';

import { useMemo } from 'react';
import { Loader2, Pause, Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useHydrated } from '@/hooks/use-hydrated';
import { createCategoryQueueSource, type CategorySegment } from '@/lib/category-queue';
import { togglePlay, play } from '@/lib/audio-controller';
import { getLessonTracks } from '@/lib/lesson-tracks';
import { playLessons } from '@/lib/play-lesson';
import { getTransportState, useAudioStore } from '@/stores/audio-store';

interface PlayCategoryButtonProps {
  categoryId: string;
  /** The category and its descendants (descendantIds). */
  scopeIds: string[];
  /** Lessons created after this instant are not part of the session. */
  snapshotAt: string;
  /** The first segment, read with the page. Null when that read failed: the button then stays hidden. */
  seed: CategorySegment | null;
}

/**
 * "Play category" for the category page header: one continuous session through
 * the category's lessons in list order. Shows what the category queue is doing
 * when it is the active queue; other queues leave it on its start label.
 */
export function PlayCategoryButton({ categoryId, scopeIds, snapshotAt, seed }: PlayCategoryButtonProps) {
  const t = useTranslations('categoryPlayback');
  const hydrated = useHydrated();
  const source = useAudioStore((s) => s.queueSource);
  const notice = useAudioStore((s) => s.queueNotice);
  const issue = useAudioStore((s) => s.playbackIssue);
  const transport = useAudioStore((s) => getTransportState(s));

  // The lessons with audio, one list of parts each, in list order.
  const playable = useMemo(
    () => (seed ? seed.lessons.map((lesson) => getLessonTracks(lesson)).filter((tracks) => tracks.length > 0) : []),
    [seed],
  );

  if (!seed || playable.length === 0) return null;

  const active = hydrated && source?.kind === 'category' && source.categoryId === categoryId;

  // Starts from the first lesson in the same tap (no await), so the browser allows playback.
  const startFromFirst = () => {
    playLessons(playable, 0, {
      source: createCategoryQueueSource({
        categoryId,
        scopeIds,
        snapshotAt,
        cursor: seed.cursor,
        exhausted: seed.exhausted,
      }),
    });
  };

  let label = t('play');
  let Icon = Play;
  let onClick = startFromFirst;
  let status: string | null = null;

  if (active && notice?.kind === 'loading') {
    label = t('loading');
    Icon = Loader2;
    onClick = togglePlay;
  } else if (active && notice?.kind === 'finished') {
    label = t('playAgain');
    status = t('finished');
  } else if (active && notice?.kind === 'stopped') {
    label = t('retry');
    onClick = play;
    status = t('stopped');
  } else if (active && issue === 'blocked') {
    label = t('tapToContinue');
    onClick = play;
  } else if (active && transport === 'playing') {
    label = t('playing');
    Icon = Pause;
    onClick = togglePlay;
  } else if (active && transport === 'loading') {
    label = t('loading');
    Icon = Loader2;
    onClick = togglePlay;
  } else if (active) {
    label = t('resume');
    onClick = play;
  }

  if (active && notice?.kind === 'skipped') status = t('skipped', { title: notice.title });

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        <Icon
          className={Icon === Loader2 ? 'h-4 w-4 animate-spin motion-reduce:animate-none' : 'h-4 w-4 fill-current'}
          aria-hidden="true"
        />
        {label}
      </button>
      {status && (
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {status}
        </p>
      )}
    </div>
  );
}
