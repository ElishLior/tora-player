-- =============================================================================
-- Migration 029: lesson sources ("מקורות השיעור"): one PDF per lesson
-- =============================================================================
-- * lesson_sources: at most one row per lesson (lesson_id is the primary key).
--   status 'expected' = the admin promised a document that has not arrived
--   (no file yet); 'ready' = the PDF is published. No row = no sources.
-- * The PDF lives in R2 under sources/<lesson_id>/<timestamp>.pdf and is served
--   only through /api/sources/[lessonId] (presigned redirect), never by key.
-- * Anyone may read the row of a published lesson; only the service role (the
--   Next.js server, after requireAdmin) writes.
-- * One foreign key, to lessons. It adds no second path between existing
--   tables (see the October 13, 2026 PGRST201 incident in 026/027).
-- * Attaching or replacing sources never touches lessons.notified_at.
-- The app tolerates this table missing (no sources section; the admin form says so).
-- Idempotent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.lesson_sources (
  lesson_id uuid PRIMARY KEY REFERENCES public.lessons(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('expected', 'ready')),
  file_key text CHECK (file_key IS NULL OR file_key LIKE 'sources/%'),
  file_name text CHECK (file_name IS NULL OR char_length(file_name) BETWEEN 1 AND 255),
  file_size bigint CHECK (file_size IS NULL OR file_size > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lesson_sources_ready_has_file
    CHECK (status <> 'ready' OR (file_key IS NOT NULL AND file_name IS NOT NULL AND file_size IS NOT NULL))
);

ALTER TABLE public.lesson_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lesson_sources_public_read ON public.lesson_sources;
CREATE POLICY lesson_sources_public_read ON public.lesson_sources
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = lesson_id AND l.is_published));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.lesson_sources FROM anon, authenticated;
GRANT SELECT ON TABLE public.lesson_sources TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
