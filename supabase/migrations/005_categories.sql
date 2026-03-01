-- =============================================================================
-- Categories: hierarchical folder structure for lessons (2 levels max)
-- =============================================================================

-- Categories table
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  hebrew_name TEXT NOT NULL,
  description TEXT,
  icon TEXT,                                          -- Lucide icon name
  sort_order INTEGER NOT NULL DEFAULT 0,
  parent_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add category_id to lessons
ALTER TABLE lessons ADD COLUMN category_id UUID REFERENCES categories(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX idx_categories_parent ON categories(parent_id);
CREATE INDEX idx_categories_sort ON categories(sort_order);
CREATE INDEX idx_lessons_category ON lessons(category_id);

-- Auto-update trigger
CREATE TRIGGER categories_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories_public_read"
  ON categories FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "categories_authenticated_insert"
  ON categories FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "categories_authenticated_update"
  ON categories FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "categories_authenticated_delete"
  ON categories FOR DELETE
  TO authenticated
  USING (true);

-- Anon insert/update for lessons.category_id (already covered by existing lessons policies)
-- No additional policies needed.

-- =============================================================================
-- Seed categories
-- =============================================================================

-- Top-level categories
INSERT INTO categories (id, name, hebrew_name, icon, sort_order)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'Lessons', 'שיעורים', 'BookOpen', 1),
  ('10000000-0000-0000-0000-000000000002', 'Work Methods', 'דרכי עבודה', 'Wrench', 2),
  ('10000000-0000-0000-0000-000000000003', 'Imagination', 'כח המדמה', 'Sparkles', 3),
  ('10000000-0000-0000-0000-000000000004', 'Short with Melodies', 'קצרים עם נעימות', 'Music', 4),
  ('10000000-0000-0000-0000-000000000005', 'Short Clips', 'קצרים', 'Scissors', 5);

-- Sub-categories under "שיעורים"
INSERT INTO categories (id, name, hebrew_name, description, sort_order, parent_id)
VALUES
  ('10000000-0000-0000-0000-000000000011', 'Etz Chaim Sequential', 'מתחילת עץ חיים', 'שיעורים מסודרים מתחילת עץ חיים', 1, '10000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000012', 'Lessons at Tzion', 'שיעורים בציון בניהו בן יהוידע', 'שיעורים לפני תחילת הסדר', 2, '10000000-0000-0000-0000-000000000001');

-- Sub-categories under "דרכי עבודה"
INSERT INTO categories (id, name, hebrew_name, sort_order, parent_id)
VALUES
  ('10000000-0000-0000-0000-000000000021', 'Work Methods Lessons', 'שיעורים', 1, '10000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000022', 'High Quality', 'שיעורים באיכות גבוהה', 2, '10000000-0000-0000-0000-000000000002');

-- =============================================================================
-- Assign existing lessons to categories
-- =============================================================================

-- Lessons WITH seder_number (systematic etz chaim study) → "מתחילת עץ חיים"
UPDATE lessons
SET category_id = '10000000-0000-0000-0000-000000000011'
WHERE seder_number IS NOT NULL;

-- Lessons WITHOUT seder_number that are before the systematic study started (2025-10-21)
-- → "שיעורים בציון בניהו בן יהוידע"
UPDATE lessons
SET category_id = '10000000-0000-0000-0000-000000000012'
WHERE seder_number IS NULL
  AND date < '2025-10-21';

-- Lessons WITHOUT seder_number from 2025-10-21 onwards (no seder but after systematic start)
-- Also go to "שיעורים בציון בניהו בן יהוידע" as default
UPDATE lessons
SET category_id = '10000000-0000-0000-0000-000000000012'
WHERE seder_number IS NULL
  AND category_id IS NULL;
