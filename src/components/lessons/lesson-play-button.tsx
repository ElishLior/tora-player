'use client';

import { togglePlay } from '@/lib/audio-controller';
import { playLesson } from '@/lib/play-lesson';
import { getTrackLessonId } from '@/lib/player-track-actions';
import { cn } from '@/lib/utils';
import { getTransportState, useAudioStore, type AudioTrack } from '@/stores/audio-store';
import { PlayPauseIcon } from '@/components/player/player-controls';

/** Whether this lesson is the loaded one, and its real transport state (never the `isPlaying` intent). */
export function useLessonPlayback(lessonId: string) {
  const isCurrent = useAudioStore((s) => !!s.currentTrack && getTrackLessonId(s.currentTrack) === lessonId);
  const transport = useAudioStore((s) => getTransportState(s));
  return { isCurrent, transport, playing: isCurrent && transport !== 'paused' };
}

interface LessonPlayButtonProps {
  lessonId: string;
  /** The lesson's tracks (getLessonTracks). */
  tracks: AudioTrack[];
  playLabel: string;
  pauseLabel: string;
  className?: string;
  iconClassName?: string;
  /** Starts playback instead of playing this lesson alone (shorts queue the list from this row). */
  onStart?: () => void;
}

/**
 * The one play/pause control for a lesson on a list or hero: pauses or resumes
 * the loaded lesson, otherwise starts it where the listener left it. Put it
 * beside a stretched lesson link, never inside it.
 */
export function LessonPlayButton({
  lessonId,
  tracks,
  playLabel,
  pauseLabel,
  className,
  iconClassName,
  onStart,
}: LessonPlayButtonProps) {
  const { isCurrent, transport, playing } = useLessonPlayback(lessonId);
  return (
    <button
      type="button"
      onClick={() => (isCurrent ? togglePlay() : onStart ? onStart() : playLesson(tracks))}
      disabled={tracks.length === 0}
      aria-label={playing ? pauseLabel : playLabel}
      className={cn(
        'relative z-10 flex flex-shrink-0 items-center justify-center rounded-full transition-[transform,background-color,color] duration-150 ease-out hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-40 motion-reduce:transition-none motion-reduce:hover:scale-100',
        className,
      )}
    >
      <PlayPauseIcon transport={isCurrent ? transport : 'paused'} className={cn('h-5 w-5', iconClassName)} />
    </button>
  );
}
