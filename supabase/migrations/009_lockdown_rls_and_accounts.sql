-- =============================================================================
-- Migration 009: lock down public writes, add user accounts
-- =============================================================================
-- Before this migration every content table accepted INSERT/UPDATE/DELETE from
-- the public anon key (002, 003, 008) and from any `authenticated` user (001,
-- 005). Once Supabase Auth sign-up is enabled, anyone could create an account
-- and rewrite the catalogue. After this migration:
--
--   * Content tables (lessons, lesson_audio, lesson_images, series, categories,
--     playlists, playlist_lessons, snippets) are read-only for anon and
--     authenticated users, and only published content is readable. All writes
--     go through the Next.js server with the service-role key after an admin
--     check (src/lib/auth/admin.ts).
--   * snippet_submissions: no direct API access; the public submits through
--     the rate-limited submitSnippet server action (service role).
--   * bookmarks / playback_progress are per-user (user_id = auth.uid()).
--       - Existing bookmarks rows have no owner; they are KEPT but become
--         invisible (user_id IS NULL never matches auth.uid()). Every device
--         still has its own copy in localStorage and uploads it on sign-in.
--       - Existing playback_progress rows were one shared row per lesson for all
--         visitors, which is meaningless per user; they are DELETED.
--   * profiles: one row per auth user, created by trigger on sign-up.
--
-- The script is idempotent: every policy on the affected tables is dropped and
-- recreated, columns/constraints are guarded, and data changes only touch rows
-- that are still in the pre-migration shape. Run it as a single transaction
-- (the Supabase CLI and SQL editor both do).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Drop every existing policy on the affected tables.
--    Uses pg_policies so policies created outside the repo (the missing
--    006/007 migrations, dashboard edits) are removed as well.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'lessons', 'lesson_audio', 'lesson_images', 'series', 'categories',
        'playlists', 'playlist_lessons', 'snippets', 'snippet_submissions',
        'bookmarks', 'playback_progress'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

ALTER TABLE public.lessons             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_audio        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_images       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.series              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlists           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_lessons    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.snippets            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.snippet_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmarks           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playback_progress   ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 2. Table privileges (defence in depth on top of RLS).
--    Content tables: SELECT only for API roles. service_role keeps full access.
-- -----------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE
  public.lessons, public.lesson_audio, public.lesson_images, public.series,
  public.categories, public.playlists, public.playlist_lessons, public.snippets
FROM anon, authenticated;

GRANT SELECT ON TABLE
  public.lessons, public.lesson_audio, public.lesson_images, public.series,
  public.categories, public.playlists, public.playlist_lessons, public.snippets
TO anon, authenticated;

-- snippet_submissions: no direct API access at all. Public submissions go
-- through the rate-limited submitSnippet server action (service role), so the
-- limit cannot be bypassed by calling PostgREST with the public anon key.
REVOKE ALL ON TABLE public.snippet_submissions FROM anon, authenticated;

-- Per-user tables: anon keeps only the SELECT privilege (RLS returns zero rows
-- because every policy below is TO authenticated); the /api/health schema
-- probe relies on it to verify the new columns exist.
REVOKE ALL ON TABLE public.bookmarks, public.playback_progress FROM anon;
GRANT SELECT ON TABLE public.bookmarks, public.playback_progress TO anon;
REVOKE TRUNCATE ON TABLE public.bookmarks, public.playback_progress FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.bookmarks, public.playback_progress TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. Content read policies (published content only).
-- -----------------------------------------------------------------------------
CREATE POLICY "lessons_read_published"
  ON public.lessons FOR SELECT
  TO anon, authenticated
  USING (is_published = true);

CREATE POLICY "lesson_audio_read_published"
  ON public.lesson_audio FOR SELECT
  TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.lessons l
    WHERE l.id = lesson_audio.lesson_id AND l.is_published = true
  ));

CREATE POLICY "lesson_images_read_published"
  ON public.lesson_images FOR SELECT
  TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.lessons l
    WHERE l.id = lesson_images.lesson_id AND l.is_published = true
  ));

CREATE POLICY "snippets_read_published"
  ON public.snippets FOR SELECT
  TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.lessons l
    WHERE l.id = snippets.parent_lesson_id AND l.is_published = true
  ));

CREATE POLICY "series_read_all"
  ON public.series FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "categories_read_all"
  ON public.categories FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "playlists_read_public"
  ON public.playlists FOR SELECT
  TO anon, authenticated
  USING (is_public = true);

CREATE POLICY "playlist_lessons_read_public"
  ON public.playlist_lessons FOR SELECT
  TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.playlists p
    WHERE p.id = playlist_lessons.playlist_id AND p.is_public = true
  ));

-- -----------------------------------------------------------------------------
-- 4. snippet_submissions: intentionally no policies (service role only, see §2).
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 5. bookmarks: per-user.
--    The row id is the client-generated bookmark id (crypto.randomUUID) so
--    offline-created bookmarks can be upserted idempotently.
-- -----------------------------------------------------------------------------
ALTER TABLE public.bookmarks
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.bookmarks
  ADD COLUMN IF NOT EXISTS tag text;
ALTER TABLE public.bookmarks
  ADD COLUMN IF NOT EXISTS audio_file_id uuid REFERENCES public.lesson_audio(id) ON DELETE SET NULL;
ALTER TABLE public.bookmarks
  ALTER COLUMN user_id SET DEFAULT auth.uid();

CREATE INDEX IF NOT EXISTS idx_bookmarks_user_lesson
  ON public.bookmarks(user_id, lesson_id, position);

CREATE POLICY "bookmarks_owner_select"
  ON public.bookmarks FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "bookmarks_owner_insert"
  ON public.bookmarks FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "bookmarks_owner_update"
  ON public.bookmarks FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "bookmarks_owner_delete"
  ON public.bookmarks FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- 6. playback_progress: per-user, unique (user_id, lesson_id).
-- -----------------------------------------------------------------------------
ALTER TABLE public.playback_progress
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- The shared pre-account rows have no owner. Only ownerless rows are deleted,
-- so re-running this migration never touches user data.
DELETE FROM public.playback_progress WHERE user_id IS NULL;

ALTER TABLE public.playback_progress ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.playback_progress ALTER COLUMN user_id SET NOT NULL;

-- Drop the old UNIQUE(lesson_id) whatever it is called.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_attribute att
      ON att.attrelid = con.conrelid AND att.attname = 'lesson_id'
    WHERE con.conrelid = 'public.playback_progress'::regclass
      AND con.contype = 'u'
      AND con.conkey = ARRAY[att.attnum]
  LOOP
    EXECUTE format('ALTER TABLE public.playback_progress DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.playback_progress'::regclass
      AND conname = 'playback_progress_user_lesson_key'
  ) THEN
    ALTER TABLE public.playback_progress
      ADD CONSTRAINT playback_progress_user_lesson_key UNIQUE (user_id, lesson_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_playback_progress_user_recent
  ON public.playback_progress(user_id, last_played_at DESC);

CREATE POLICY "playback_progress_owner_select"
  ON public.playback_progress FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "playback_progress_owner_insert"
  ON public.playback_progress FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "playback_progress_owner_update"
  ON public.playback_progress FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "playback_progress_owner_delete"
  ON public.playback_progress FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- 7. profiles
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text CHECK (display_name IS NULL OR char_length(display_name) <= 80),
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  notify_new_lessons boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_owner_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_owner_update" ON public.profiles;

CREATE POLICY "profiles_owner_select"
  ON public.profiles FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = id);

CREATE POLICY "profiles_owner_update"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

-- Users may read their own row and edit only display_name/notify_new_lessons.
-- `role` is changed only with the service role (dashboard / SQL).
-- Revoking the table-level UPDATE also revokes column grants, so re-running is safe.
REVOKE ALL ON TABLE public.profiles FROM anon, authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT UPDATE (display_name, notify_new_lessons) ON TABLE public.profiles TO authenticated;

-- Create a profile for every new auth user.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    left(nullif(trim(coalesce(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name',
      ''
    )), ''), 80)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill profiles for users created before this migration (if any).
INSERT INTO public.profiles (id)
SELECT u.id FROM auth.users u
ON CONFLICT (id) DO NOTHING;
