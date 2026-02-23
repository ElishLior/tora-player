'use client';

import { Play, Pause, SkipForward, SkipBack } from 'lucide-react';
import { useAudioPlayer } from '@/hooks/use-audio-player';
import { SeekBar } from '@/components/player/seek-bar';
import { SpeedControl } from '@/components/player/speed-control';
import type { LessonWithRelations } from '@/types/database';

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
        audioUrl: lesson.audio_url!,
        audioUrlFallback: lesson.audio_url_fallback || undefined,
        duration: lesson.duration,
        seriesName: lesson.series?.hebrew_name || lesson.series?.name || undefined,
        date: lesson.date,
      });
    }
  };

  const displayTime = isCurrentLesson ? currentTime : 0;
  const displayDuration = isCurrentLesson ? duration : lesson.duration;

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      {/* Seek bar */}
      <SeekBar
        currentTime={displayTime}
        duration={displayDuration}
        onSeek={seekTo}
      />

      {/* Controls */}
      <div className="flex items-center justify-center gap-4">
        <SpeedControl
          speed={isCurrentLesson ? playbackSpeed : 1}
          onSpeedChange={setPlaybackSpeed}
        />

        <button
          onClick={() => skipBackward(15)}
          className="rounded-full p-3 hover:bg-muted transition-colors"
          disabled={!isCurrentLesson}
        >
          <SkipBack className="h-5 w-5" />
        </button>

        <button
          onClick={handlePlay}
          className="rounded-full p-4 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-md"
        >
          {isCurrentLesson && isPlaying ? (
            <Pause className="h-7 w-7" />
          ) : (
            <Play className="h-7 w-7 ms-0.5" />
          )}
        </button>

        <button
          onClick={() => skipForward(15)}
          className="rounded-full p-3 hover:bg-muted transition-colors"
          disabled={!isCurrentLesson}
        >
          <SkipForward className="h-5 w-5" />
        </button>

        <div className="w-12" /> {/* Spacer for symmetry */}
      </div>
    </div>
  );
}
