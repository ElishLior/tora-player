-- =============================================================================
-- Migration 027: lesson_categories without a foreign key to categories
-- =============================================================================
-- Incident, October 13, 2026: migration 026 first created
-- lesson_categories.category_id REFERENCES categories(id). PostgREST then saw two
-- relationships between lessons and categories (lessons.category_id and the
-- lesson_categories junction), so every `categories(...)` embed without an FK
-- hint failed with PGRST201. The live 1.1.4 code embeds it that way: lesson
-- pages returned 404 and lists were empty for a few minutes, until the key was
-- dropped live (ALTER TABLE ... DROP CONSTRAINT, then NOTIFY pgrst).
--
-- This migration records that fix and replaces what the key did:
-- 1. Drop the key (no-op when it is already gone).
-- 2. When a category is deleted, delete its memberships (the old ON DELETE CASCADE).
-- 3. Remove memberships that point at categories that no longer exist.
--
-- 1.2 code also names the primary relationship explicitly
-- (`categories!lessons_category_id_fkey`, src/lib/supabase/lesson-selects.ts).
-- Do not add a foreign key from lesson_categories to categories while any
-- deployed code embeds `categories(...)` from lessons without that hint.
-- Idempotent.
-- =============================================================================

ALTER TABLE public.lesson_categories DROP CONSTRAINT IF EXISTS lesson_categories_category_id_fkey;

CREATE OR REPLACE FUNCTION public.categories_drop_memberships()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.lesson_categories WHERE category_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS categories_drop_memberships ON public.categories;
CREATE TRIGGER categories_drop_memberships
  AFTER DELETE ON public.categories
  FOR EACH ROW
  EXECUTE FUNCTION public.categories_drop_memberships();

DELETE FROM public.lesson_categories lc
WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.id = lc.category_id);

NOTIFY pgrst, 'reload schema';
