'use client';

import { Play, Pause, Volume2 } from 'lucide-react';
import { useAudioStore } from '@/stores/audio-store';
import { normalizeAudioUrl } from '@/lib/audio-url';
import type { LessonAudio } from '@/types/database';

interface AudioFileListProps {
  lessonId: string;
  lessonTitle: string;
  hebrewTitle: string;
  lessonDate: string;
  lessonDuration: number;
  seriesName?: string;
  audioFiles: LessonAudio[];
  locale: string;
}

function formatDur(seconds: number): string {
  if (!seconds || seconds <= 0) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function AudioFileList({
  lessonId,
  lessonTitle,
  hebrewTitle,
  lessonDate,
  lessonDuration,
  seriesName,
  audioFiles,
  locale,
}: AudioFileListProps) {
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const setTrack = useAudioStore((s) => s.setTrack);
  const togglePlay = useAudioStore((s) => s.togglePlay);

  const sorted = [...audioFiles].sort((a, b) => a.sort_order - b.sort_order);

  function isFileActive(audio: LessonAudio): boolean {
    if (!currentTrack) return false;
    const normalizedFileUrl = normalizeAudioUrl(audio.audio_url);
    return currentTrack.audioUrl === normalizedFileUrl || currentTrack.audioUrl === audio.audio_url;
  }

  function handleFileClick(audio: LessonAudio) {
    if (isFileActive(audio)) {
      togglePlay();
      return;
    }
    setTrack({
      id: lessonId,
      title: lessonTitle,
      hebrewTitle,
      audioUrl: normalizeAudioUrl(audio.audio_url) || audio.audio_url,
      duration: audio.duration || lessonDuration,
      seriesName,
      date: lessonDate,
    });
  }

  return (
    <section>
      <h2 className="text-sm font-bold mb-3 text-muted-foreground uppercase tracking-wider">
        {locale === 'he' ? 'קבצי שמע' : 'Audio Files'}
      </h2>
      <div className="space-y-0.5">
        {sorted.map((audio, index) => {
          const active = isFileActive(audio);
          const playing = active && isPlaying;
          return (
            <button
              key={audio.id}
              onClick={() => handleFileClick(audio)}
              className={`w-full flex items-center gap-3 rounded-md p-2.5 transition-colors group text-start ${
                active
                  ? 'bg-primary/10'
                  : 'hover:bg-[hsl(var(--surface-highlight))]'
              }`}
            >
              <span className="w-5 text-center flex-shrink-0">
                {playing ? (
                  <Volume2 className="h-4 w-4 text-primary animate-pulse mx-auto" />
                ) : active ? (
                  <Pause className="h-4 w-4 text-primary mx-auto" />
                ) : (
                  <>
                    <span className="text-sm font-medium text-muted-foreground group-hover:hidden">
                      {index + 1}
                    </span>
                    <Play className="h-4 w-4 text-foreground hidden group-hover:block mx-auto" />
                  </>
                )}
              </span>

              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm font-medium truncate ${active ? 'text-primary' : ''}`}
                  dir="rtl"
                >
                  {audio.original_name || `${locale === 'he' ? 'חלק' : 'Part'} ${index + 1}`}
                </p>
              </div>

              {audio.duration > 0 && (
                <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">
                  {formatDur(audio.duration)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
