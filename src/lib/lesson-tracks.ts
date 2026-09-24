import { normalizeAudioUrl } from '@/lib/audio-url';
import { getOfflineKey } from '@/lib/offline-storage';
import type { AudioTrack } from '@/stores/audio-store';
import type { LessonAudio, LessonWithRelations } from '@/types/database';

/*
 * A lesson's playable audio files and the player tracks made from them.
 * Shared by the lesson page and the personal library (resume).
 */

export interface LessonAudioAsset {
  audioFileId?: string;
  fileKey?: string;
  audioUrl: string;
  title: string;
  originalName?: string | null;
  audioType?: string | null;
  duration: number;
  fileSize?: number;
  sortOrder: number;
  offlineKey: string;
}

export function getSortedAudioFiles(lesson: LessonWithRelations): LessonAudio[] {
  return [...(lesson.audio_files || [])].sort((a, b) => {
    const order = a.sort_order - b.sort_order;
    if (order !== 0) return order;
    return a.id.localeCompare(b.id);
  });
}

export function getLessonAudioAssets(lesson: LessonWithRelations): LessonAudioAsset[] {
  const sortedAudioFiles = getSortedAudioFiles(lesson);
  if (sortedAudioFiles.length > 0) {
    return sortedAudioFiles.map((audio, index) => {
      const audioUrl = normalizeAudioUrl(audio.audio_url) || audio.audio_url;
      return {
        audioFileId: audio.id,
        fileKey: audio.file_key,
        audioUrl,
        title: audio.original_name || `חלק ${index + 1}`,
        originalName: audio.original_name,
        audioType: audio.audio_type,
        duration: audio.duration || 0,
        fileSize: audio.file_size,
        sortOrder: audio.sort_order ?? index,
        offlineKey: getOfflineKey(lesson.id, {
          audioFileId: audio.id,
          fileKey: audio.file_key,
          audioUrl,
        }),
      };
    });
  }

  const audioUrl = normalizeAudioUrl(lesson.audio_url) || lesson.audio_url;
  if (!audioUrl) return [];

  return [
    {
      audioUrl,
      title: lesson.hebrew_title || lesson.title,
      duration: lesson.duration,
      fileSize: lesson.file_size,
      sortOrder: 0,
      offlineKey: getOfflineKey(lesson.id, { audioUrl }),
    },
  ];
}

export function createLessonTrack(lesson: LessonWithRelations, asset: LessonAudioAsset): AudioTrack {
  return {
    id: lesson.id,
    lessonId: lesson.id,
    audioFileId: asset.audioFileId,
    fileKey: asset.fileKey,
    offlineKey: asset.offlineKey,
    title: lesson.title,
    hebrewTitle: lesson.hebrew_title || lesson.title,
    audioUrl: asset.audioUrl,
    audioUrlFallback: normalizeAudioUrl(lesson.audio_url_fallback) || undefined,
    duration: asset.duration || lesson.duration,
    seriesName: lesson.series?.hebrew_name || lesson.series?.name || undefined,
    date: lesson.date,
    description: lesson.description || lesson.summary || undefined,
    originalName: asset.originalName || asset.title,
  };
}

/**
 * Locale-less path that opens a lesson and plays from `position` seconds of
 * the given audio file (the main file when none). Read by the lesson page.
 */
export function lessonMomentPath(lessonId: string, position: number, audioFileId?: string | null): string {
  const file = audioFileId ? `&file=${encodeURIComponent(audioFileId)}` : '';
  return `/lessons/${lessonId}?t=${Math.floor(position)}${file}`;
}
