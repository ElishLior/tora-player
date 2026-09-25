import { describe, expect, it } from 'vitest';
import type { LessonAudio, LessonWithRelations } from '@/types/database';
import { getLessonAudioAssets, getLessonTracks, getOfflineLessonTracks } from './lesson-tracks';

const lesson: LessonWithRelations = {
  id: 'lesson-1',
  title: 'Lesson',
  hebrew_title: 'שיעור',
  description: null,
  date: '2026-05-10',
  audio_url: null,
  audio_url_fallback: null,
  audio_url_original: null,
  duration: 1800,
  file_size: 0,
  codec: 'mp3',
  recorded_at: null,
  series_id: null,
  part_number: null,
  parent_lesson_id: null,
  source_text: null,
  source_type: 'upload',
  is_published: true,
  hebrew_date: null,
  parsha: null,
  teacher: null,
  location: null,
  summary: null,
  lesson_type: null,
  seder_number: null,
  category_id: null,
  tags: [],
  created_at: '2026-05-10',
  updated_at: '2026-05-10',
};

function audio(id: string, sortOrder: number, duration: number): LessonAudio {
  return {
    id,
    lesson_id: lesson.id,
    file_key: `audio/${id}.mp3`,
    audio_url: `/api/audio/stream/${id}.mp3`,
    original_name: null,
    source_filename: null,
    content_sha1: null,
    file_size: 100,
    duration,
    codec: 'mp3',
    sort_order: sortOrder,
    audio_type: null,
    created_at: '2026-05-10',
  };
}

describe('lesson audio part metadata', () => {
  it('keeps source order independent of database sort order and preserves unknown file duration', () => {
    const multipart = { ...lesson, audio_files: [audio('third', 30, 300), audio('first', 10, 0), audio('second', 20, 600)] };
    expect(getLessonAudioAssets(multipart).map(({ audioFileId, partIndex, partCount }) => ({ audioFileId, partIndex, partCount }))).toEqual([
      { audioFileId: 'first', partIndex: 0, partCount: 3 },
      { audioFileId: 'second', partIndex: 1, partCount: 3 },
      { audioFileId: 'third', partIndex: 2, partCount: 3 },
    ]);
    expect(getLessonTracks(multipart)[0]).toMatchObject({ partIndex: 0, partCount: 3, duration: 0 });
  });

  it('retains single-file lesson duration when there are no per-file assets', () => {
    expect(getLessonTracks({ ...lesson, audio_url: '/single.mp3' })[0]).toMatchObject({
      partIndex: 0, partCount: 1, duration: 1800,
    });
  });

  it('retains the lesson duration when its only audio row has no measured duration', () => {
    const [online] = getLessonTracks({ ...lesson, audio_files: [audio('only', 0, 0)] });
    expect(online.duration).toBe(1800);

    const [saved] = getOfflineLessonTracks({
      lessonId: lesson.id,
      title: lesson.title,
      hebrewTitle: lesson.hebrew_title || lesson.title,
      audioUrl: online.audioUrl,
      duration: lesson.duration,
      fileSize: 100,
      downloadedAt: '2026-05-10T00:00:00.000Z',
      date: lesson.date,
      audioFiles: [{
        offlineKey: 'lesson-1:only',
        lessonId: lesson.id,
        audioFileId: 'only',
        audioUrl: online.audioUrl,
        mimeType: 'audio/mpeg',
        duration: 0,
        fileSize: 100,
        sortOrder: 0,
        partIndex: 0,
        partCount: 1,
        downloadedAt: '2026-05-10T00:00:00.000Z',
      }],
    });
    expect(saved.duration).toBe(1800);
  });
});
