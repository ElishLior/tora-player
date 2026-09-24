-- Lesson search and category counts (infrastructure audit R6).
--
-- 1. Trigram GIN indexes on lessons.title, hebrew_title and description, so the
--    lesson search (`ilike '%q%'` on those three columns, src/lib/supabase/lesson-list.ts)
--    can use an index instead of scanning every row.
-- 2. category_lesson_counts(): published lessons per category, counted in SQL
--    instead of fetching every lesson row to count in JS.
--
-- Additive and idempotent: safe to apply before the code that uses it ships,
-- and safe to run again.

-- Supabase keeps extensions in the `extensions` schema. If pg_trgm is already
-- installed elsewhere this is a no-op, so the indexes below look up where it lives.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

DO $$
DECLARE
  trgm_schema text;
BEGIN
  SELECT n.nspname INTO trgm_schema
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pg_trgm';

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_lessons_title_trgm ON public.lessons USING gin (title %I.gin_trgm_ops)',
    trgm_schema
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_lessons_hebrew_title_trgm ON public.lessons USING gin (hebrew_title %I.gin_trgm_ops)',
    trgm_schema
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_lessons_description_trgm ON public.lessons USING gin (description %I.gin_trgm_ops)',
    trgm_schema
  );
END $$;

-- Category lesson counts for the home and categories pages: published lessons
-- only, so it is safe for anon (same rules as lesson_tag_counts(), migration 016).
CREATE OR REPLACE FUNCTION public.category_lesson_counts()
RETURNS TABLE (category_id uuid, lesson_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT l.category_id, count(*) AS lesson_count
  FROM public.lessons l
  WHERE l.is_published AND l.category_id IS NOT NULL
  GROUP BY l.category_id;
$$;

GRANT EXECUTE ON FUNCTION public.category_lesson_counts() TO anon, authenticated, service_role;
