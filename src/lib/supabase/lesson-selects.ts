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
  'id, slug, title, hebrew_title, description, summary, date, hebrew_date, parsha, duration, file_size, audio_url, audio_url_fallback, part_number, category_id, lesson_type, tags, created_at';

/**
 * A lesson's category, embedded in list rows: enough for categoryLabel() (both
 * names). The name is read here, so a card's category badge can show English.
 */
// The FK hint names the primary-category relationship: lesson_categories (migration 026) is a second
// path from lessons to categories, and an unhinted `categories(...)` embed becomes ambiguous (PGRST201)
// if that table ever gets a foreign key to categories.
export const LESSON_CATEGORY = 'category:categories!lessons_category_id_fkey(id, hebrew_name, name)';
