-- =============================================================================
-- Tora Player Database Schema
-- Initial migration: all core tables, indexes, triggers, and RLS policies
-- =============================================================================

-- Enable UUID generation (available by default on Supabase, but explicit is safe)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- TABLES
-- =============================================================================

-- Series table (groups of related lessons)
CREATE TABLE series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  hebrew_name TEXT,
  description TEXT,
  cover_image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lessons table (individual Torah lessons)
CREATE TABLE lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  hebrew_title TEXT,
  description TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  audio_url TEXT,                                    -- Primary audio (Opus/WebM)
  audio_url_fallback TEXT,                           -- Fallback audio (AAC/M4A)
  audio_url_original TEXT,                           -- Original uploaded file
  duration INTEGER NOT NULL DEFAULT 0,               -- Duration in seconds
  file_size BIGINT NOT NULL DEFAULT 0,               -- File size in bytes
  codec TEXT NOT NULL DEFAULT 'opus',                -- Primary codec used
  series_id UUID REFERENCES series(id) ON DELETE SET NULL,
  part_number INTEGER,                               -- For multi-part lessons (1, 2, etc.)
  parent_lesson_id UUID REFERENCES lessons(id) ON DELETE SET NULL,
  source_text TEXT,                                  -- Original WhatsApp message text
  source_type TEXT NOT NULL DEFAULT 'upload',         -- 'upload', 'url_import', 'whatsapp'
  recorded_at TIMESTAMPTZ,                           -- When the lesson was originally recorded
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Snippets (shorter cuts from main lessons)
CREATE TABLE snippets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  hebrew_title TEXT,
  start_time INTEGER NOT NULL DEFAULT 0,             -- Start time in seconds
  end_time INTEGER NOT NULL,                         -- End time in seconds
  audio_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Playlists
CREATE TABLE playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  hebrew_name TEXT,
  description TEXT,
  cover_image_url TEXT,
  is_public BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Playlist lessons (junction table)
CREATE TABLE playlist_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(playlist_id, lesson_id)
);

-- Bookmarks (timestamps within lessons)
CREATE TABLE bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,               -- Position in seconds
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Playback progress (resume from last position)
CREATE TABLE playback_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE UNIQUE,
  position INTEGER NOT NULL DEFAULT 0,               -- Position in seconds
  completed BOOLEAN NOT NULL DEFAULT false,
  last_played_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Lessons
CREATE INDEX idx_lessons_date ON lessons(date DESC);
CREATE INDEX idx_lessons_series ON lessons(series_id);
CREATE INDEX idx_lessons_parent ON lessons(parent_lesson_id);
CREATE INDEX idx_lessons_published ON lessons(is_published) WHERE is_published = true;
CREATE INDEX idx_lessons_source_type ON lessons(source_type);
CREATE INDEX idx_lessons_recorded_at ON lessons(recorded_at DESC) WHERE recorded_at IS NOT NULL;

-- Snippets
CREATE INDEX idx_snippets_parent ON snippets(parent_lesson_id);

-- Playlist lessons
CREATE INDEX idx_playlist_lessons_playlist ON playlist_lessons(playlist_id, position);
CREATE INDEX idx_playlist_lessons_lesson ON playlist_lessons(lesson_id);

-- Bookmarks
CREATE INDEX idx_bookmarks_lesson ON bookmarks(lesson_id, position);

-- Playback progress
CREATE INDEX idx_playback_progress_lesson ON playback_progress(lesson_id);
CREATE INDEX idx_playback_progress_recent ON playback_progress(last_played_at DESC);

-- Full-text search for Hebrew content (using 'simple' config which works for all languages)
CREATE INDEX idx_lessons_search ON lessons
  USING gin(to_tsvector('simple',
    coalesce(title, '') || ' ' ||
    coalesce(hebrew_title, '') || ' ' ||
    coalesce(description, '')
  ));

CREATE INDEX idx_series_search ON series
  USING gin(to_tsvector('simple',
    coalesce(name, '') || ' ' ||
    coalesce(hebrew_name, '') || ' ' ||
    coalesce(description, '')
  ));

-- =============================================================================
-- TRIGGERS: auto-update updated_at columns
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lessons_updated_at
  BEFORE UPDATE ON lessons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER series_updated_at
  BEFORE UPDATE ON series
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER playlists_updated_at
  BEFORE UPDATE ON playlists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER playback_progress_updated_at
  BEFORE UPDATE ON playback_progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE series ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE snippets ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlist_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE playback_progress ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- SERIES: public read, authenticated write
-- ---------------------------------------------------------------------------
CREATE POLICY "series_public_read"
  ON series FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "series_authenticated_insert"
  ON series FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "series_authenticated_update"
  ON series FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "series_authenticated_delete"
  ON series FOR DELETE
  TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- LESSONS: public read (published only for anon), authenticated full access
-- ---------------------------------------------------------------------------
CREATE POLICY "lessons_public_read"
  ON lessons FOR SELECT
  TO anon
  USING (is_published = true);

CREATE POLICY "lessons_authenticated_read"
  ON lessons FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "lessons_authenticated_insert"
  ON lessons FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "lessons_authenticated_update"
  ON lessons FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "lessons_authenticated_delete"
  ON lessons FOR DELETE
  TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- SNIPPETS: public read, authenticated write
-- ---------------------------------------------------------------------------
CREATE POLICY "snippets_public_read"
  ON snippets FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "snippets_authenticated_insert"
  ON snippets FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "snippets_authenticated_update"
  ON snippets FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "snippets_authenticated_delete"
  ON snippets FOR DELETE
  TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- PLAYLISTS: public playlists readable by all, authenticated full access
-- ---------------------------------------------------------------------------
CREATE POLICY "playlists_public_read"
  ON playlists FOR SELECT
  TO anon
  USING (is_public = true);

CREATE POLICY "playlists_authenticated_read"
  ON playlists FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "playlists_authenticated_insert"
  ON playlists FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "playlists_authenticated_update"
  ON playlists FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "playlists_authenticated_delete"
  ON playlists FOR DELETE
  TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- PLAYLIST LESSONS: public read (for public playlists), authenticated write
-- ---------------------------------------------------------------------------
CREATE POLICY "playlist_lessons_public_read"
  ON playlist_lessons FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM playlists
      WHERE playlists.id = playlist_lessons.playlist_id
        AND (playlists.is_public = true OR current_setting('request.jwt.claims', true)::json->>'role' = 'authenticated')
    )
  );

CREATE POLICY "playlist_lessons_authenticated_insert"
  ON playlist_lessons FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "playlist_lessons_authenticated_update"
  ON playlist_lessons FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "playlist_lessons_authenticated_delete"
  ON playlist_lessons FOR DELETE
  TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- BOOKMARKS: public read, authenticated write
-- ---------------------------------------------------------------------------
CREATE POLICY "bookmarks_public_read"
  ON bookmarks FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "bookmarks_authenticated_insert"
  ON bookmarks FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "bookmarks_authenticated_update"
  ON bookmarks FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "bookmarks_authenticated_delete"
  ON bookmarks FOR DELETE
  TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- PLAYBACK PROGRESS: public read/write (anonymous progress tracking)
-- Note: This uses anon key for local device progress. No auth required.
-- ---------------------------------------------------------------------------
CREATE POLICY "playback_progress_public_read"
  ON playback_progress FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "playback_progress_public_insert"
  ON playback_progress FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "playback_progress_public_update"
  ON playback_progress FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "playback_progress_public_delete"
  ON playback_progress FOR DELETE
  TO authenticated
  USING (true);

-- =============================================================================
-- GRANT SERVICE ROLE BYPASS (for admin operations via service_role key)
-- Note: The service_role key automatically bypasses RLS in Supabase.
-- No explicit grants needed.
-- =============================================================================
