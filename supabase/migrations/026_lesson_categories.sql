-- =============================================================================
-- Lessons in several categories (v1.2, owner decision October 13, 2026:
-- "A lesson in several categories": the admin ticks any categories or
-- subcategories at any of the three levels, and the lesson appears in each).
--
-- WRITTEN, NOT APPLIED. Production is the only database; apply only after the
-- owner approves the exact plan.
--
-- 1. lesson_categories(lesson_id, category_id, position): one row per lesson and
--    category. Primary key (lesson_id, category_id), index (category_id,
--    lesson_id) for the category pages. Position 0 is the primary category.
-- 2. RLS: anon and authenticated may read rows of published lessons only. No
--    write policy and no write privilege: the service role writes after
--    requireAdmin() (src/lib/supabase/lesson-category-writes.ts).
-- 3. Backfill: one row per lesson that has lessons.category_id today.
-- 4. lessons.category_id stays the PRIMARY category (the first one ticked).
--    The 1.1.4 production code, uploads, feeds, /shorts and the notifications
--    read that column, so they keep working unchanged. The trigger
--    lessons_sync_primary_category keeps the two in step for every write path:
--    - an insert or an update that sets category_id ensures that pair exists;
--    - an update that changes category_id removes the OLD primary pair. Extra
--      categories stay. This is what makes an old single-category write (the
--      1.1.4 code) replace the primary in the lesson's memberships too.
--    The app writes category_id FIRST, then upserts the selection, then deletes
--    rows outside it (see writeLessonCategories). That order keeps a reordering
--    such as [A, B] -> [B, A] from dropping A.
-- 5. category_lesson_counts() counts DISTINCT published lessons per category
--    through the membership table (same return shape as migration 018).
-- 6. category_subtree_lesson_counts() counts DISTINCT published lessons per
--    category and all its descendants. A lesson in a parent and in its child is
--    counted once in the parent's total (the old per-category sum double counted).
--
-- Rollback (in this order):
--   a. DROP TRIGGER IF EXISTS lessons_sync_primary_category ON public.lessons;
--      DROP FUNCTION IF EXISTS public.lessons_sync_primary_category();
--   b. DROP FUNCTION IF EXISTS public.category_subtree_lesson_counts();
--   c. Restore the migration 018 body of category_lesson_counts():
--        SELECT l.category_id, count(*) AS lesson_count FROM public.lessons l
--        WHERE l.is_published AND l.category_id IS NOT NULL GROUP BY l.category_id;
--   d. DROP TABLE IF EXISTS public.lesson_categories;
-- Without this migration the app keeps working: category pages, playback and
-- /lessons?cat= fall back to lessons.category_id (src/lib/supabase/category-scope.ts),
-- and the lesson editor saves the primary only, with a notice to apply it.
--
-- Idempotent: IF NOT EXISTS, CREATE OR REPLACE, DROP ... IF EXISTS, ON CONFLICT.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.lesson_categories (
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  position smallint NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (lesson_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_lesson_categories_category
  ON public.lesson_categories (category_id, lesson_id);

ALTER TABLE public.lesson_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lesson_categories_read_published ON public.lesson_categories;
CREATE POLICY lesson_categories_read_published ON public.lesson_categories
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.lessons l
      WHERE l.id = lesson_categories.lesson_id AND l.is_published
    )
  );

-- Public roles read through RLS only; every write is the service role's.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.lesson_categories FROM anon, authenticated;
GRANT SELECT ON public.lesson_categories TO anon, authenticated, service_role;

-- Backfill: every lesson's current primary category becomes its first membership.
INSERT INTO public.lesson_categories (lesson_id, category_id, position)
SELECT l.id, l.category_id, 0
FROM public.lessons l
WHERE l.category_id IS NOT NULL
ON CONFLICT (lesson_id, category_id) DO NOTHING;

-- Keeps lessons.category_id (the primary) and its membership row in step.
CREATE OR REPLACE FUNCTION public.lessons_sync_primary_category()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- The primary moved: the old primary no longer belongs to the lesson as primary.
  -- Other memberships stay, so a single-category write never wipes a multi-category set.
  IF TG_OP = 'UPDATE' AND OLD.category_id IS NOT NULL
     AND OLD.category_id IS DISTINCT FROM NEW.category_id THEN
    DELETE FROM public.lesson_categories
    WHERE lesson_id = NEW.id AND category_id = OLD.category_id;
  END IF;

  IF NEW.category_id IS NOT NULL THEN
    INSERT INTO public.lesson_categories (lesson_id, category_id, position)
    VALUES (NEW.id, NEW.category_id, 0)
    ON CONFLICT (lesson_id, category_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lessons_sync_primary_category ON public.lessons;
CREATE TRIGGER lessons_sync_primary_category
  AFTER INSERT OR UPDATE OF category_id ON public.lessons
  FOR EACH ROW
  EXECUTE FUNCTION public.lessons_sync_primary_category();

-- Published lessons per category, counted through the memberships (distinct per lesson).
CREATE OR REPLACE FUNCTION public.category_lesson_counts()
RETURNS TABLE (category_id uuid, lesson_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT lc.category_id, count(DISTINCT lc.lesson_id) AS lesson_count
  FROM public.lesson_categories lc
  JOIN public.lessons l ON l.id = lc.lesson_id
  WHERE l.is_published
  GROUP BY lc.category_id;
$$;

GRANT EXECUTE ON FUNCTION public.category_lesson_counts() TO anon, authenticated, service_role;

-- Published lessons per category INCLUDING its subcategories, each lesson once.
CREATE OR REPLACE FUNCTION public.category_subtree_lesson_counts()
RETURNS TABLE (category_id uuid, lesson_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH RECURSIVE tree (root_id, node_id) AS (
    SELECT c.id, c.id FROM public.categories c
    UNION ALL
    SELECT t.root_id, c.id
    FROM tree t
    JOIN public.categories c ON c.parent_id = t.node_id
  )
  SELECT t.root_id AS category_id, count(DISTINCT lc.lesson_id) AS lesson_count
  FROM tree t
  JOIN public.lesson_categories lc ON lc.category_id = t.node_id
  JOIN public.lessons l ON l.id = lc.lesson_id AND l.is_published
  GROUP BY t.root_id;
$$;

GRANT EXECUTE ON FUNCTION public.category_subtree_lesson_counts() TO anon, authenticated, service_role;

-- Make PostgREST see the new table and the embed relationship at once.
NOTIFY pgrst, 'reload schema';
