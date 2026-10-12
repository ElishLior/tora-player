-- =============================================================================
-- Migration 024: bookmarks.updated_at (stale-edit protection for bookmark edits)
-- =============================================================================
-- * bookmarks.updated_at: when the row last changed. Existing rows start at
--   their created_at, so the first edit of an old bookmark is comparable.
-- * Trigger bookmarks_touch_updated_at: every UPDATE sets updated_at to now()
--   (truncated to milliseconds, so the value round-trips exactly through the
--   client). An edit is conditioned on the updated_at the editor last saw
--   (src/actions/bookmarks.ts updateBookmark); 0 rows = changed elsewhere.
-- The app tolerates this migration missing: the column is then not selected,
-- edits are unconditional by id + user (no stale-edit check), and merges keep
-- the account copy (src/lib/account/merge.ts). Idempotent.
-- Depends on the bookmarks table (001 or its later definition). Trigger is
-- created after the backfill so the backfill does not bump anything.
-- =============================================================================

ALTER TABLE public.bookmarks ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE public.bookmarks
SET updated_at = created_at
WHERE updated_at IS NULL;

ALTER TABLE public.bookmarks
  ALTER COLUMN updated_at SET DEFAULT date_trunc('milliseconds', now());

ALTER TABLE public.bookmarks
  ALTER COLUMN updated_at SET NOT NULL;

CREATE OR REPLACE FUNCTION public.bookmarks_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := date_trunc('milliseconds', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookmarks_touch_updated_at ON public.bookmarks;
CREATE TRIGGER bookmarks_touch_updated_at
  BEFORE UPDATE ON public.bookmarks
  FOR EACH ROW
  EXECUTE FUNCTION public.bookmarks_touch_updated_at();
