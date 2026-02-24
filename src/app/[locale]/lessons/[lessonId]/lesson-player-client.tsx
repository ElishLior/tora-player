'use client';

import { Play, Pause, Cast } from 'lucide-react';
import { useAudioPlayer } from '@/hooks/use-audio-player';
import { SeekBar } from '@/components/player/seek-bar';
import { SpeedControl } from '@/components/player/speed-control';
import { handleCastClick } from '@/lib/cast-utils';
import type { LessonWithRelations } from '@/types/database';
import { normalizeAudioUrl } from '@/lib/audio-url';

function Skip15Back({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 5V1L7 5l5 4V5" />
      <path d="M19.07 7.93A8 8 0 1 1 7 5.3" />
      <text x="12" y="15.5" textAnchor="middle" fill="currentColor" stroke="none" fontSize="7.5" fontWeight="bold" fontFamily="system-ui">15</text>
    </svg>
  );
}

function Skip15Forward({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 5V1l5 4-5 4V5" />
      <path d="M4.93 7.93A8 8 0 1 0 17 5.3" />
      <text x="12" y="15.5" textAnchor="middle" fill="currentColor" stroke="none" fontSize="7.5" fontWeight="bold" fontFamily="system-ui">15</text>
    </svg>
  );
}

interface LessonPlayerClientProps {
  lesson: LessonWithRelations;
}

export function LessonPlayerClient({ lesson }: LessonPlayerClientProps) {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    playbackSpeed,
    togglePlay,
    skipForward,
    skipBackward,
    seekTo,
    setPlaybackSpeed,
    playTrack,
  } = useAudioPlayer();

  const isCurrentLesson = currentTrack?.id === lesson.id;

  const handlePlay = () => {
    if (isCurrentLesson) {
      togglePlay();
    } else {
      playTrack({
        id: lesson.id,
        title: lesson.title,
        hebrewTitle: lesson.hebrew_title || lesson.title,
        audioUrl: normalizeAudioUrl(lesson.audio_url) || lesson.audio_url!,
        audioUrlFallback: normalizeAudioUrl(lesson.audio_url_fallback) || undefined,
        duration: lesson.duration,
        seriesName: lesson.series?.hebrew_name || lesson.series?.name || undefined,
        date: lesson.date,
      });
    }
  };

  const displayTime = isCurrentLesson ? currentTime : 0;
  const displayDuration = isCurrentLesson ? duration : lesson.duration;

  return (
    <div className="rounded-xl bg-[hsl(var(--surface-elevated))] p-5 space-y-4">
      {/* Seek bar */}
      <SeekBar
        currentTime={displayTime}
        duration={displayDuration}
        onSeek={seekTo}
      />

      {/* Controls — dir="ltr" to prevent RTL from flipping arrows */}
      <div dir="ltr" className="flex items-center justify-center gap-5">
        <SpeedControl
          speed={isCurrentLesson ? playbackSpeed : 1}
          onSpeedChange={setPlaybackSpeed}
        />

        <button
          onClick={() => skipBackward(15)}
          className="p-2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
          disabled={!isCurrentLesson}
        >
          <Skip15Back className="h-7 w-7" />
        </button>

        <button
          onClick={handlePlay}
          className="rounded-full p-4 bg-foreground text-background hover:scale-105 transition-transform shadow-lg"
        >
          {isCurrentLesson && isPlaying ? (
            <Pause className="h-7 w-7 fill-current" />
          ) : (
            <Play className="h-7 w-7 fill-current ms-0.5" />
          )}
        </button>

        <button
          onClick={() => skipForward(15)}
          className="p-2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
          disabled={!isCurrentLesson}
        >
          <Skip15Forward className="h-7 w-7" />
        </button>

        {/* Cast / broadcast */}
        <button
          onClick={(e) => { e.stopPropagation(); handleCastClick(); }}
          className="p-2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Cast"
        >
          <Cast className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
