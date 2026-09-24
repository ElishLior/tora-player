-- =============================================================================
-- Migration 010: new-lesson notifications (Web Push + email)
-- =============================================================================
-- * push_subscriptions: one row per browser/device push endpoint. Anonymous
--   visitors may subscribe (user_id NULL). Only the service role (Next.js
--   server) reads or writes this table.
-- * lessons.notified_at: set atomically when notifyNewLesson() claims a lesson,
--   so double-clicks and retries never notify twice. Lessons already published
--   before this migration are marked as notified.
-- * new_lesson_email_recipients(): emails of confirmed users who opted in
--   (profiles.notify_new_lessons), callable by the service role only.
-- Depends on 009 (profiles). Idempotent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE CHECK (char_length(endpoint) <= 1000),
  p256dh text NOT NULL CHECK (char_length(p256dh) <= 200),
  auth text NOT NULL CHECK (char_length(auth) <= 100),
  user_agent text CHECK (user_agent IS NULL OR char_length(user_agent) <= 400),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON public.push_subscriptions(user_id)
  WHERE user_id IS NOT NULL;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: anon/authenticated get nothing, service_role bypasses RLS.
REVOKE ALL ON TABLE public.push_subscriptions FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- lessons.notified_at
-- Added with DEFAULT now() so every existing row is stamped without a table
-- rewrite or firing the updated_at trigger; the default is then dropped and
-- unpublished lessons are reset so they notify when first published.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lessons' AND column_name = 'notified_at'
  ) THEN
    ALTER TABLE public.lessons ADD COLUMN notified_at timestamptz DEFAULT now();
    ALTER TABLE public.lessons ALTER COLUMN notified_at DROP DEFAULT;
    UPDATE public.lessons SET notified_at = NULL WHERE is_published = false;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Email recipients (service role only).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.new_lesson_email_recipients()
RETURNS TABLE (email text, display_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.email::text, p.display_name
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.notify_new_lessons = true
    AND u.email IS NOT NULL
    AND u.email_confirmed_at IS NOT NULL
    AND u.deleted_at IS NULL
    AND (u.banned_until IS NULL OR u.banned_until < now());
$$;

REVOKE EXECUTE ON FUNCTION public.new_lesson_email_recipients() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.new_lesson_email_recipients() TO service_role;
