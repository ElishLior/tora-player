-- Free-form topic tags on lessons (in addition to the single category).
-- Stored normalized (see src/lib/tags.ts): trimmed, inner whitespace collapsed,
-- no leading '#', max 40 chars, max 12 per lesson.
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.lessons'::regclass AND conname = 'lessons_tags_limit'
  ) THEN
    ALTER TABLE public.lessons
      ADD CONSTRAINT lessons_tags_limit CHECK (cardinality(tags) <= 12);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lessons_tags ON public.lessons USING gin (tags);

-- Tag cloud / suggestions: published lessons only, so it is safe for anon.
CREATE OR REPLACE FUNCTION public.lesson_tag_counts()
RETURNS TABLE (tag text, lesson_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT t.tag, count(*) AS lesson_count
  FROM public.lessons l, unnest(l.tags) AS t(tag)
  WHERE l.is_published
  GROUP BY t.tag
  ORDER BY lesson_count DESC, t.tag;
$$;

GRANT EXECUTE ON FUNCTION public.lesson_tag_counts() TO anon, authenticated, service_role;
