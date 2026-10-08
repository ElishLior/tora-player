-- An old slug keeps redirecting to its lesson: another lesson may not take it.
--
-- 020 let a new current slug that matched another lesson's history entry win
-- (and deleted that redirect). Old links must never move to a different
-- lesson, so that case now fails like a duplicate slug. The app treats
-- 23505 mentioning "lessons_slug_key" as a slug collision and tries the next
-- suffix (src/lib/supabase/create-lesson-slug.ts) or shows "slug taken"
-- (src/actions/lessons.ts). A lesson can still return to one of its own old
-- slugs; that entry then leaves the history because it is current again.

CREATE OR REPLACE FUNCTION public.remember_lesson_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.slug IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.lesson_slug_history h
    WHERE h.slug = NEW.slug AND h.lesson_id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'duplicate key value violates unique constraint "lessons_slug_key"'
      USING ERRCODE = 'unique_violation',
            DETAIL = format('Key (slug)=(%s) is an old address of another lesson.', NEW.slug);
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.slug IS NOT NULL AND NEW.slug IS DISTINCT FROM OLD.slug THEN
    INSERT INTO public.lesson_slug_history (slug, lesson_id)
    VALUES (OLD.slug, OLD.id)
    ON CONFLICT (slug) DO UPDATE
      SET lesson_id = EXCLUDED.lesson_id, replaced_at = now();
  END IF;
  IF NEW.slug IS NOT NULL THEN
    DELETE FROM public.lesson_slug_history WHERE slug = NEW.slug AND lesson_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
