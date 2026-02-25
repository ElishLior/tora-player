'use client';

import { useState } from 'react';
import { Play, Pause, Cast, Volume2, X, ChevronRight, ChevronLeft } from 'lucide-react';
import { useLocale } from 'next-intl';
import { useAudioPlayer } from '@/hooks/use-audio-player';
import { SeekBar } from '@/components/player/seek-bar';
import { SpeedControl } from '@/components/player/speed-control';
import { handleCastClick } from '@/lib/cast-utils';
import type { LessonWithRelations, LessonAudio, LessonImage } from '@/types/database';
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

function formatDur(seconds: number): string {
  if (!seconds || seconds <= 0) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface LessonPlayerClientProps {
  lesson: LessonWithRelations;
  images?: LessonImage[];
}

export function LessonPlayerClient({ lesson, images }: LessonPlayerClientProps) {
  const locale = useLocale();
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
    setTrack,
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

  // Audio file list helpers
  const audioFiles = lesson.audio_files || [];
  const sortedAudioFiles = [...audioFiles].sort((a, b) => a.sort_order - b.sort_order);

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
      id: lesson.id,
      title: lesson.title,
      hebrewTitle: lesson.hebrew_title || lesson.title,
      audioUrl: normalizeAudioUrl(audio.audio_url) || audio.audio_url,
      duration: audio.duration || lesson.duration,
      seriesName: lesson.series?.hebrew_name || lesson.series?.name || undefined,
      date: lesson.date,
    });
  }

  const displayTime = isCurrentLesson ? currentTime : 0;
  const displayDuration = isCurrentLesson ? duration : lesson.duration;

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-[hsl(var(--surface-elevated))] p-5 space-y-4">
        {/* Seek bar */}
        <SeekBar
          currentTime={displayTime}
          duration={displayDuration}
          onSeek={seekTo}
        />

        {/* Controls — dir="ltr" keeps standard media player layout (⏪ ▶ ⏩) */}
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
              <Play className="h-7 w-7 fill-current ml-0.5" />
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
            onClick={(e) => { e.stopPropagation(); void handleCastClick(); }}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Cast"
          >
            <Cast className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Audio files list (inlined to avoid webpack dev chunk issue) */}
      {sortedAudioFiles.length > 1 && (
        <div className="rounded-xl bg-[hsl(var(--surface-elevated))] p-4">
          <h2 className="text-sm font-bold mb-3 text-muted-foreground uppercase tracking-wider">
            {locale === 'he' ? 'קבצי שמע' : 'Audio Files'}
          </h2>
          <div className="space-y-0.5">
            {sortedAudioFiles.map((audio, index) => {
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

                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <p
                      className={`text-sm font-medium truncate ${active ? 'text-primary' : ''}`}
                      dir="rtl"
                    >
                      {audio.original_name || `${locale === 'he' ? 'חלק' : 'Part'} ${index + 1}`}
                    </p>
                    {audio.audio_type && (
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                        audio.audio_type === 'עץ חיים'
                          ? 'bg-primary/15 text-primary'
                          : 'bg-amber-500/15 text-amber-400'
                      }`}>
                        {audio.audio_type}
                      </span>
                    )}
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
        </div>
      )}

      {/* Image gallery */}
      {images && images.length > 0 && (
        <ImageGallerySection images={images} locale={locale} />
      )}
    </div>
  );
}

// ==================== Image Gallery (inlined to share webpack chunk) ====================

function getImageStreamUrl(fileKey: string) {
  const encodedKey = encodeURIComponent(fileKey);
  return `/api/images/stream/${encodedKey}`;
}

function ImageGallerySection({ images, locale }: { images: LessonImage[]; locale: string }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const sorted = [...images].sort((a, b) => a.sort_order - b.sort_order);

  const openLightbox = (index: number) => setLightboxIndex(index);
  const closeLightbox = () => setLightboxIndex(null);

  const goNext = () => {
    if (lightboxIndex !== null) {
      setLightboxIndex((lightboxIndex + 1) % sorted.length);
    }
  };
  const goPrev = () => {
    if (lightboxIndex !== null) {
      setLightboxIndex((lightboxIndex - 1 + sorted.length) % sorted.length);
    }
  };

  return (
    <div>
      <h2 className="text-sm font-bold mb-3 text-muted-foreground uppercase tracking-wider" dir="rtl">
        {locale === 'he' ? 'תמונות' : 'Images'}
      </h2>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {sorted.map((img, i) => (
          <button
            key={img.id}
            onClick={() => openLightbox(i)}
            className="relative aspect-square rounded-lg overflow-hidden bg-[hsl(var(--surface-elevated))] hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <img
              src={getImageStreamUrl(img.file_key)}
              alt={img.caption || img.original_name || ''}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </button>
        ))}
      </div>

      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center"
          onClick={closeLightbox}
        >
          <button
            onClick={closeLightbox}
            className="absolute top-4 end-4 z-10 rounded-full p-2 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 transition-colors"
            aria-label="Close"
          >
            <X className="h-6 w-6" />
          </button>

          <div className="absolute top-5 start-4 text-sm text-white/60 tabular-nums">
            {lightboxIndex + 1} / {sorted.length}
          </div>

          {sorted.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); goPrev(); }}
              className="absolute start-2 top-1/2 -translate-y-1/2 z-10 rounded-full p-2 text-white/60 hover:text-white bg-white/10 hover:bg-white/20 transition-colors"
              aria-label="Previous"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}

          <img
            src={getImageStreamUrl(sorted[lightboxIndex].file_key)}
            alt={sorted[lightboxIndex].caption || sorted[lightboxIndex].original_name || ''}
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />

          {sorted.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); goNext(); }}
              className="absolute end-2 top-1/2 -translate-y-1/2 z-10 rounded-full p-2 text-white/60 hover:text-white bg-white/10 hover:bg-white/20 transition-colors"
              aria-label="Next"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}

          {sorted[lightboxIndex].caption && (
            <div className="absolute bottom-6 inset-x-0 text-center">
              <p className="text-sm text-white/80 bg-black/50 inline-block px-4 py-2 rounded-full" dir="rtl">
                {sorted[lightboxIndex].caption}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
