-- =============================================================================
-- Migration 028: app-wide display settings an admin changes from the panel
-- =============================================================================
-- * app_settings: one row per setting (key -> jsonb value). The first key is
--   'home_tip_interval_seconds' (the home page's "טיפים ועדכונים" rotation,
--   rules in src/lib/app-settings.ts). A missing row means the default.
-- * Everyone may read (the values are public display settings); only the
--   service role (the Next.js server, after requireAdmin) writes.
-- * No foreign keys: nothing here can add a second PostgREST path between
--   existing tables (see the October 13, 2026 incident in 026/027).
-- The app tolerates this table missing (defaults, and the admin form says so).
-- Idempotent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY CHECK (char_length(key) BETWEEN 1 AND 100),
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_settings_public_read ON public.app_settings;
CREATE POLICY app_settings_public_read ON public.app_settings
  FOR SELECT TO anon, authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.app_settings FROM anon, authenticated;
GRANT SELECT ON TABLE public.app_settings TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
