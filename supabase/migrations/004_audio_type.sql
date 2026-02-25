-- Migration 004: Add audio_type to lesson_audio
-- Allows tagging audio files as 'סידור' or 'עץ חיים' (or custom)
-- =============================================================================

ALTER TABLE lesson_audio ADD COLUMN IF NOT EXISTS audio_type TEXT;

CREATE INDEX IF NOT EXISTS idx_lesson_audio_type ON lesson_audio(audio_type);
