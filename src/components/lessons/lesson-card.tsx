'use client';

import { Play, Pause } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { formatDuration } from '@/lib/utils';
import { useAudioStore, type AudioTrack } from '@/stores/audio-store';
import { normalizeAudioUrl } from '@/lib/audio-url';
import type { LessonWithRelations } from '@/types/database';

interface LessonCardProps {
  lesson: LessonWithRelations;
  showProgress?: boolean;
}

export function LessonCard({ lesson, showProgress }: LessonCardProps) {
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const togglePlay = useAudioStore((s) => s.togglePlay);
  const setTrack = useAudioStore((s) => s.setTrack);

  const isCurrentlyPlaying = currentTrack?.id === lesson.id;

  const progressPercent = lesson.progress && lesson.duration > 0
    ? Math.round((lesson.progress.position / lesson.duration) * 100)
    : 0;

  const handlePlay = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isCurrentlyPlaying) {
      togglePlay();
      return;
    }
    if (!lesson.audio_url) return;
    setTrack({
      id: lesson.id,
      title: lesson.title,
      hebrewTitle: lesson.hebrew_title || lesson.title,
      audioUrl: normalizeAudioUrl(lesson.audio_url) || lesson.audio_url,
      audioUrlFallback: normalizeAudioUrl(lesson.audio_url_fallback) || undefined,
      duration: lesson.duration,
      seriesName: lesson.series?.hebrew_name || lesson.series?.name || undefined,
      date: lesson.date,
    });
  };

  return (
    <Link
      href={`/lessons/${lesson.id}`}
      className="group block rounded-lg p-3 transition-all hover:bg-[hsl(var(--surface-highlight))]"
    >
      <div className="flex items-center gap-3">
        {/* Play button / Equalizer */}
        <button
          onClick={handlePlay}
          className="flex-shrink-0 h-10 w-10 rounded-md bg-[hsl(var(--surface-elevated))] flex items-center justify-center transition-all group-hover:bg-primary group-hover:shadow-lg group-hover:shadow-primary/25"
          aria-label="Play"
        >
          {isCurrentlyPlaying && isPlaying ? (
            <div className="flex items-center gap-[2px] group-hover:hidden">
              <div className="equalizer-bar bg-primary h-3" />
              <div className="equalizer-bar bg-primary h-3" />
              <div className="equalizer-bar bg-primary h-3" />
            </div>
          ) : null}
          {isCurrentlyPlaying && isPlaying ? (
            <Pause className="h-4 w-4 text-primary-foreground hidden group-hover:block" />
          ) : (
            <Play className="h-4 w-4 ms-0.5 text-muted-foreground group-hover:text-primary-foreground" />
          )}
        </button>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3 className={`text-sm font-semibold truncate ${
            isCurrentlyPlaying ? 'text-primary' : 'text-foreground'
          }`} dir="rtl">
            {lesson.hebrew_title || lesson.title}
          </h3>

          <p className="text-xs text-muted-foreground truncate mt-0.5" dir="rtl">
            {lesson.parsha && (
              <span className="text-primary/80">{lesson.parsha}</span>
            )}
            {lesson.parsha && ' · '}
            {lesson.hebrew_date || new Date(lesson.date).toLocaleDateString('he-IL')}
            {lesson.duration > 0 && ` · ${formatDuration(lesson.duration)}`}
          </p>
        </div>

        {/* Part badge */}
        {lesson.part_number && (
          <span className="text-[10px] text-muted-foreground bg-[hsl(var(--surface-elevated))] px-2 py-0.5 rounded-full flex-shrink-0">
            {lesson.part_number}
          </span>
        )}
      </div>

      {/* Progress bar */}
      {showProgress && progressPercent > 0 && (
        <div className="mt-2 ms-[52px] h-0.5 w-auto overflow-hidden rounded-full bg-[hsl(0,0%,24%)]">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}
    </Link>
  );
}
