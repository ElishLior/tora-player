'use client';

import { Play, Clock, Calendar } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { formatDuration } from '@/lib/utils';
import { useAudioPlayer } from '@/hooks/use-audio-player';
import type { LessonWithRelations } from '@/types/database';

interface LessonCardProps {
  lesson: LessonWithRelations;
  showProgress?: boolean;
}

export function LessonCard({ lesson, showProgress }: LessonCardProps) {
  const { playTrack } = useAudioPlayer();

  const progressPercent = lesson.progress && lesson.duration > 0
    ? Math.round((lesson.progress.position / lesson.duration) * 100)
    : 0;

  const handlePlay = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!lesson.audio_url) return;
    playTrack({
      id: lesson.id,
      title: lesson.title,
      hebrewTitle: lesson.hebrew_title || lesson.title,
      audioUrl: lesson.audio_url,
      audioUrlFallback: lesson.audio_url_fallback || undefined,
      duration: lesson.duration,
      seriesName: lesson.series?.hebrew_name || lesson.series?.name || undefined,
      date: lesson.date,
    });
  };

  return (
    <Link
      href={`/lessons/${lesson.id}`}
      className="group block rounded-xl border bg-card p-4 transition-all hover:border-primary/30 hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        {/* Play button */}
        <button
          onClick={handlePlay}
          className="mt-1 flex-shrink-0 rounded-full bg-primary/10 p-2.5 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground"
          aria-label="Play"
        >
          <Play className="h-4 w-4 ms-0.5" />
        </button>

        {/* Info */}
        <div className="flex-1 min-w-0 space-y-1">
          <h3 className="font-medium truncate" dir="rtl">
            {lesson.hebrew_title || lesson.title}
          </h3>

          {lesson.series && (
            <p className="text-sm text-muted-foreground truncate" dir="rtl">
              {lesson.series.hebrew_name || lesson.series.name}
            </p>
          )}

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {new Date(lesson.date).toLocaleDateString('he-IL')}
            </span>
            {lesson.duration > 0 && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDuration(lesson.duration)}
              </span>
            )}
            {lesson.part_number && (
              <span className="rounded bg-muted px-1.5 py-0.5">
                חלק {lesson.part_number}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      {showProgress && progressPercent > 0 && (
        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}
    </Link>
  );
}
