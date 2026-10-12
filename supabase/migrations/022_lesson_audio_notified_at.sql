-- =============================================================================
-- Migration 022: announce each lesson part once (lesson_audio.notified_at)
-- =============================================================================
-- * lesson_audio.notified_at: set atomically when an announcement claims the
--   part (notified_at IS NULL → now(), src/lib/notifications/notify.ts), like
--   lessons.notified_at (010). Parts appended later to a lesson that was
--   already announced get their own "נוסף חלק חדש" notification, once.
-- * Backfill: every part that exists now counts as announced, so nothing old
--   is announced again.
-- The app tolerates this column missing (it then skips part tracking).
-- Depends on 002 (lesson_audio). Idempotent.
-- =============================================================================

ALTER TABLE public.lesson_audio ADD COLUMN IF NOT EXISTS notified_at timestamptz;

UPDATE public.lesson_audio
SET notified_at = COALESCE(created_at, now())
WHERE notified_at IS NULL;
