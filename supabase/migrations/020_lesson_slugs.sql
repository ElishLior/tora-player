-- Lesson URL slugs: `<topic>-<DD-MM-YYYY>` (owner decision, October 8, 2026).
--
-- The lesson UUID stays the identity (progress, bookmarks, notes, RSS GUIDs);
-- a slug only names the lesson page URL. Additive and nullable: a lesson
-- without a slug keeps its `/lessons/<uuid>` URL, and every UUID URL keeps
-- working (it redirects to the slug URL once one is set).
--
-- When a slug changes, the trigger keeps the old one in lesson_slug_history so
-- the old URL redirects to the current one. A slug that is (again) in use as a
-- current slug is removed from the history, so a current slug always wins.
-- Rules for building slugs live in src/lib/lesson-slugs.ts.

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS slug text;

ALTER TABLE public.lessons
  DROP CONSTRAINT IF EXISTS lessons_slug_format;
ALTER TABLE public.lessons
  ADD CONSTRAINT lessons_slug_format
  CHECK (slug IS NULL OR (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 80));

CREATE UNIQUE INDEX IF NOT EXISTS lessons_slug_key ON public.lessons (slug);

CREATE TABLE IF NOT EXISTS public.lesson_slug_history (
  slug text PRIMARY KEY,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  replaced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lesson_slug_history_lesson_id_idx
  ON public.lesson_slug_history (lesson_id);

ALTER TABLE public.lesson_slug_history ENABLE ROW LEVEL SECURITY;

-- Readable exactly like the lessons it points to: published ones only.
REVOKE ALL ON TABLE public.lesson_slug_history FROM anon, authenticated;
GRANT SELECT ON TABLE public.lesson_slug_history TO anon, authenticated;

DROP POLICY IF EXISTS "lesson_slug_history_read_published" ON public.lesson_slug_history;
CREATE POLICY "lesson_slug_history_read_published"
  ON public.lesson_slug_history FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.lessons l
    WHERE l.id = lesson_slug_history.lesson_id AND l.is_published = true
  ));

CREATE OR REPLACE FUNCTION public.remember_lesson_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.slug IS NOT NULL AND NEW.slug IS DISTINCT FROM OLD.slug THEN
    INSERT INTO public.lesson_slug_history (slug, lesson_id)
    VALUES (OLD.slug, OLD.id)
    ON CONFLICT (slug) DO UPDATE
      SET lesson_id = EXCLUDED.lesson_id, replaced_at = now();
  END IF;
  IF NEW.slug IS NOT NULL THEN
    DELETE FROM public.lesson_slug_history WHERE slug = NEW.slug;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lessons_remember_slug ON public.lessons;
CREATE TRIGGER lessons_remember_slug
  BEFORE INSERT OR UPDATE OF slug ON public.lessons
  FOR EACH ROW EXECUTE FUNCTION public.remember_lesson_slug();
