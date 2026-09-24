-- =============================================================================
-- Migration 014: personal lesson notes (account-synced) + note images
-- =============================================================================
-- * lesson_notes: one row per personal note. The row id is the client-generated
--   note id (crypto.randomUUID) so device notes upload idempotently. updated_at
--   is the device's edit time (last-write-wins between devices), so it is
--   written by the app and has no trigger.
-- * lesson_note_images: images attached to a note (max 5 per note, enforced by
--   trigger). Files live in private R2 keys `user-notes/<user_id>/<note_id>/…`
--   and are served only through /api/notes/images/<id> after an ownership
--   check. Rows are inserted by the upload route with the user's session; the
--   insert policy pins file_key to the caller's own prefix so a crafted row can
--   never point at somebody else's object. Rows are never updated.
-- Both tables are owner-only (authenticated, user_id = auth.uid()); anon has no
-- access. Depends on 001 (lessons, lesson_audio). Idempotent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.lesson_notes (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  audio_file_id uuid REFERENCES public.lesson_audio(id) ON DELETE SET NULL,
  position_seconds numeric CHECK (position_seconds IS NULL OR position_seconds >= 0),
  body text NOT NULL CHECK (char_length(body) <= 10000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lesson_notes_user_lesson
  ON public.lesson_notes(user_id, lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_notes_user_updated
  ON public.lesson_notes(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.lesson_note_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL REFERENCES public.lesson_notes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  file_key text NOT NULL UNIQUE CHECK (char_length(file_key) <= 300),
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/heic')),
  file_size integer NOT NULL CHECK (file_size > 0),
  width integer CHECK (width IS NULL OR width > 0),
  height integer CHECK (height IS NULL OR height > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lesson_note_images_note
  ON public.lesson_note_images(note_id, created_at);
CREATE INDEX IF NOT EXISTS idx_lesson_note_images_user
  ON public.lesson_note_images(user_id);

-- -----------------------------------------------------------------------------
-- At most 5 images per note. Locking the parent note row serialises concurrent
-- uploads to the same note, so parallel inserts cannot slip past the count.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_note_image_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  PERFORM 1 FROM public.lesson_notes WHERE id = NEW.note_id FOR UPDATE;
  IF (SELECT count(*) FROM public.lesson_note_images WHERE note_id = NEW.note_id) >= 5 THEN
    RAISE EXCEPTION 'note_image_limit' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lesson_note_images_limit ON public.lesson_note_images;
CREATE TRIGGER lesson_note_images_limit
  BEFORE INSERT ON public.lesson_note_images
  FOR EACH ROW EXECUTE FUNCTION public.enforce_note_image_limit();

-- -----------------------------------------------------------------------------
-- Privileges + RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.lesson_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_note_images ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.lesson_notes, public.lesson_note_images FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lesson_notes TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.lesson_note_images TO authenticated;

DROP POLICY IF EXISTS "lesson_notes_owner_select" ON public.lesson_notes;
DROP POLICY IF EXISTS "lesson_notes_owner_insert" ON public.lesson_notes;
DROP POLICY IF EXISTS "lesson_notes_owner_update" ON public.lesson_notes;
DROP POLICY IF EXISTS "lesson_notes_owner_delete" ON public.lesson_notes;

CREATE POLICY "lesson_notes_owner_select"
  ON public.lesson_notes FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "lesson_notes_owner_insert"
  ON public.lesson_notes FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "lesson_notes_owner_update"
  ON public.lesson_notes FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "lesson_notes_owner_delete"
  ON public.lesson_notes FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "lesson_note_images_owner_select" ON public.lesson_note_images;
DROP POLICY IF EXISTS "lesson_note_images_owner_insert" ON public.lesson_note_images;
DROP POLICY IF EXISTS "lesson_note_images_owner_delete" ON public.lesson_note_images;

CREATE POLICY "lesson_note_images_owner_select"
  ON public.lesson_note_images FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "lesson_note_images_owner_insert"
  ON public.lesson_note_images FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND file_key LIKE 'user-notes/' || user_id::text || '/' || note_id::text || '/%'
    AND EXISTS (
      SELECT 1 FROM public.lesson_notes n
      WHERE n.id = note_id AND n.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "lesson_note_images_owner_delete"
  ON public.lesson_note_images FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);
