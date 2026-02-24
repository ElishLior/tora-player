-- Migration 002: Allow anon role writes + add lesson_audio table for multi-file support
-- =============================================================================
-- This version uses DROP POLICY IF EXISTS before CREATE to be idempotent

-- =============================================================================
-- 1. ADD ANON WRITE POLICIES (single-admin app without auth)
-- =============================================================================

-- Drop existing policies first to make this idempotent
DROP POLICY IF EXISTS "lessons_anon_insert" ON lessons;
DROP POLICY IF EXISTS "lessons_anon_update" ON lessons;
DROP POLICY IF EXISTS "lessons_anon_delete" ON lessons;
DROP POLICY IF EXISTS "lessons_anon_read_all" ON lessons;
DROP POLICY IF EXISTS "lessons_public_read" ON lessons;

-- LESSONS: allow anon insert/update/delete + read all
CREATE POLICY "lessons_anon_insert"
  ON lessons FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "lessons_anon_update"
  ON lessons FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "lessons_anon_delete"
  ON lessons FOR DELETE
  TO anon
  USING (true);

CREATE POLICY "lessons_anon_read_all"
  ON lessons FOR SELECT
  TO anon
  USING (true);

-- SERIES
DROP POLICY IF EXISTS "series_anon_insert" ON series;
DROP POLICY IF EXISTS "series_anon_update" ON series;
DROP POLICY IF EXISTS "series_anon_delete" ON series;
DROP POLICY IF EXISTS "series_anon_read" ON series;

CREATE POLICY "series_anon_insert"
  ON series FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "series_anon_update"
  ON series FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "series_anon_delete"
  ON series FOR DELETE
  TO anon
  USING (true);

CREATE POLICY "series_anon_read"
  ON series FOR SELECT
  TO anon
  USING (true);

-- SNIPPETS
DROP POLICY IF EXISTS "snippets_anon_insert" ON snippets;
DROP POLICY IF EXISTS "snippets_anon_update" ON snippets;
DROP POLICY IF EXISTS "snippets_anon_delete" ON snippets;

CREATE POLICY "snippets_anon_insert"
  ON snippets FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "snippets_anon_update"
  ON snippets FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "snippets_anon_delete"
  ON snippets FOR DELETE
  TO anon
  USING (true);

-- PLAYLISTS
DROP POLICY IF EXISTS "playlists_anon_insert" ON playlists;
DROP POLICY IF EXISTS "playlists_anon_update" ON playlists;
DROP POLICY IF EXISTS "playlists_anon_delete" ON playlists;
DROP POLICY IF EXISTS "playlists_anon_read" ON playlists;
DROP POLICY IF EXISTS "playlists_public_read" ON playlists;

CREATE POLICY "playlists_anon_insert"
  ON playlists FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "playlists_anon_update"
  ON playlists FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "playlists_anon_delete"
  ON playlists FOR DELETE
  TO anon
  USING (true);

CREATE POLICY "playlists_anon_read"
  ON playlists FOR SELECT
  TO anon
  USING (true);

-- PLAYLIST_LESSONS
DROP POLICY IF EXISTS "playlist_lessons_anon_insert" ON playlist_lessons;
DROP POLICY IF EXISTS "playlist_lessons_anon_update" ON playlist_lessons;
DROP POLICY IF EXISTS "playlist_lessons_anon_delete" ON playlist_lessons;

CREATE POLICY "playlist_lessons_anon_insert"
  ON playlist_lessons FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "playlist_lessons_anon_update"
  ON playlist_lessons FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "playlist_lessons_anon_delete"
  ON playlist_lessons FOR DELETE
  TO anon
  USING (true);

-- BOOKMARKS
DROP POLICY IF EXISTS "bookmarks_anon_insert" ON bookmarks;
DROP POLICY IF EXISTS "bookmarks_anon_update" ON bookmarks;
DROP POLICY IF EXISTS "bookmarks_anon_delete" ON bookmarks;

CREATE POLICY "bookmarks_anon_insert"
  ON bookmarks FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "bookmarks_anon_update"
  ON bookmarks FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "bookmarks_anon_delete"
  ON bookmarks FOR DELETE
  TO anon
  USING (true);

-- =============================================================================
-- 2. CREATE LESSON_AUDIO TABLE (multi-file audio per lesson)
-- =============================================================================

CREATE TABLE IF NOT EXISTS lesson_audio (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  file_key TEXT NOT NULL,
  audio_url TEXT NOT NULL,
  original_name TEXT,
  file_size BIGINT DEFAULT 0,
  duration INTEGER DEFAULT 0,
  codec TEXT DEFAULT 'mp3',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_lesson_audio_lesson_id ON lesson_audio(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_audio_sort ON lesson_audio(lesson_id, sort_order);

-- Enable RLS
ALTER TABLE lesson_audio ENABLE ROW LEVEL SECURITY;

-- Drop + recreate policies for lesson_audio
DROP POLICY IF EXISTS "lesson_audio_read" ON lesson_audio;
DROP POLICY IF EXISTS "lesson_audio_insert" ON lesson_audio;
DROP POLICY IF EXISTS "lesson_audio_update" ON lesson_audio;
DROP POLICY IF EXISTS "lesson_audio_delete" ON lesson_audio;

CREATE POLICY "lesson_audio_read"
  ON lesson_audio FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "lesson_audio_insert"
  ON lesson_audio FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "lesson_audio_update"
  ON lesson_audio FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "lesson_audio_delete"
  ON lesson_audio FOR DELETE
  TO anon, authenticated
  USING (true);

-- =============================================================================
-- 3. UPDATE TRIGGER FOR lesson_audio
-- =============================================================================

CREATE OR REPLACE FUNCTION update_lesson_audio_summary()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE lessons
  SET
    duration = COALESCE((
      SELECT SUM(duration)
      FROM lesson_audio
      WHERE lesson_id = COALESCE(NEW.lesson_id, OLD.lesson_id)
    ), 0),
    audio_url = COALESCE((
      SELECT audio_url
      FROM lesson_audio
      WHERE lesson_id = COALESCE(NEW.lesson_id, OLD.lesson_id)
      ORDER BY sort_order ASC
      LIMIT 1
    ), NULL),
    updated_at = now()
  WHERE id = COALESCE(NEW.lesson_id, OLD.lesson_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lesson_audio_summary ON lesson_audio;
CREATE TRIGGER trg_lesson_audio_summary
  AFTER INSERT OR UPDATE OR DELETE ON lesson_audio
  FOR EACH ROW EXECUTE FUNCTION update_lesson_audio_summary();
