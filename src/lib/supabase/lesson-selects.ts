/**
 * A lesson's audio parts: enough to build its player queue
 * (lib/lesson-tracks). Every list whose cards can start playback selects it.
 */
export const LESSON_AUDIO_FILES =
  'audio_files:lesson_audio(id, lesson_id, file_key, audio_url, original_name, audio_type, duration, file_size, sort_order)';

/**
 * The lesson columns lists read instead of `*`: what LessonCard, the shorts
 * list and the player queue (getLessonTracks) use, plus the filter fields
 * (category, type, tags). Only the lesson page reads the full row. List rows
 * are typed LessonWithRelations (`overrideTypes`); other columns are absent.
 */
export const LESSON_CARD_COLUMNS =
  'id, title, hebrew_title, description, summary, date, hebrew_date, parsha, duration, file_size, audio_url, audio_url_fallback, part_number, category_id, lesson_type, tags, created_at';
