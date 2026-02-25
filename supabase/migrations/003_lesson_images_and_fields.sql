-- Migration 003: Add lesson metadata fields + lesson_images table
-- =============================================================================

-- =============================================================================
-- 1. ADD NEW COLUMNS TO LESSONS TABLE
-- =============================================================================

-- Hebrew-specific metadata
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS hebrew_date TEXT;        -- e.g. "כ"ט תשרי תשפ״ו"
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS parsha TEXT;             -- Weekly Torah portion e.g. "בשלח"
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS teacher TEXT;            -- Teacher name e.g. "אליהו"
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS location TEXT;           -- Location e.g. "ציון בניהו בן יהוידע"
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS summary TEXT;            -- Text summary from WhatsApp messages
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS lesson_type TEXT;        -- e.g. "שיעור יומי", "קטע שיעור"
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS seder_number INTEGER;   -- Lesson number in the seder (1-based)

-- Index for parsha-based filtering
CREATE INDEX IF NOT EXISTS idx_lessons_parsha ON lessons(parsha) WHERE parsha IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lessons_teacher ON lessons(teacher) WHERE teacher IS NOT NULL;

-- =============================================================================
-- 2. CREATE LESSON_IMAGES TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS lesson_images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  file_key TEXT NOT NULL,              -- R2 storage key
  image_url TEXT NOT NULL,             -- Public URL via /api/images/stream/
  original_name TEXT,                  -- Original filename
  file_size BIGINT DEFAULT 0,
  width INTEGER,                       -- Image width in pixels
  height INTEGER,                      -- Image height in pixels
  caption TEXT,                        -- Optional caption
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lesson_images_lesson_id ON lesson_images(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_images_sort ON lesson_images(lesson_id, sort_order);

-- Enable RLS
ALTER TABLE lesson_images ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "lesson_images_read" ON lesson_images;
DROP POLICY IF EXISTS "lesson_images_insert" ON lesson_images;
DROP POLICY IF EXISTS "lesson_images_update" ON lesson_images;
DROP POLICY IF EXISTS "lesson_images_delete" ON lesson_images;

CREATE POLICY "lesson_images_read"
  ON lesson_images FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "lesson_images_insert"
  ON lesson_images FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "lesson_images_update"
  ON lesson_images FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "lesson_images_delete"
  ON lesson_images FOR DELETE
  TO anon, authenticated
  USING (true);

-- =============================================================================
-- 3. UPDATE FULL-TEXT SEARCH INDEX TO INCLUDE SUMMARY + PARSHA
-- =============================================================================

DROP INDEX IF EXISTS idx_lessons_search;
CREATE INDEX idx_lessons_search ON lessons
  USING gin(to_tsvector('simple',
    coalesce(title, '') || ' ' ||
    coalesce(hebrew_title, '') || ' ' ||
    coalesce(description, '') || ' ' ||
    coalesce(summary, '') || ' ' ||
    coalesce(parsha, '') || ' ' ||
    coalesce(teacher, '')
  ));
