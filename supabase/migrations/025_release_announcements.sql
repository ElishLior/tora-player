-- =============================================================================
-- Migration 025: manual release announcements (Web Push only)
-- =============================================================================
-- * release_announcements: one row per release notice an admin writes and sends
--   by hand (src/lib/notifications/release-announcement.ts). Only the service
--   role (the Next.js server) reads or writes it, like push_subscriptions (010).
-- * status: draft (editable) -> sending (claimed by one send) -> sent | failed
--   (terminal). The claim is UPDATE ... WHERE status = 'draft', so a double
--   click or a retry can never send the same notice twice.
-- * One live notice per version: the partial unique index allows a single row
--   per version in 'sending' or 'sent'. A second claim for the same version
--   fails with 23505 and sends nothing.
-- The app tolerates this table missing (sending is then disabled, with a notice).
-- Depends on 010 (push_subscriptions) and auth.users. Idempotent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.release_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL CHECK (char_length(version) <= 30),
  title_he text NOT NULL CHECK (char_length(title_he) BETWEEN 1 AND 120),
  body_he text NOT NULL CHECK (char_length(body_he) BETWEEN 1 AND 400),
  title_en text NOT NULL CHECK (char_length(title_en) BETWEEN 1 AND 120),
  body_en text NOT NULL CHECK (char_length(body_en) BETWEEN 1 AND 400),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sending', 'sent', 'failed')),
  -- Null for an admin signed in with the password fallback (no user id).
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  sent_count integer NOT NULL DEFAULT 0 CHECK (sent_count >= 0),
  failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS release_announcements_one_live_per_version
  ON public.release_announcements (version)
  WHERE status IN ('sending', 'sent');

ALTER TABLE public.release_announcements ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: anon/authenticated get nothing, service_role bypasses RLS.
REVOKE ALL ON TABLE public.release_announcements FROM anon, authenticated;
