-- =============================================================================
-- Migration 015: listen events + admin insight functions
-- =============================================================================
-- * listen_events: one row per play session (one track, one device), written
--   only by POST /api/listen through the service role. The player creates the
--   row once a track has really played for 30 seconds and then updates
--   listened_seconds with throttled heartbeats (client-generated session_id).
--   device_id is a random id the browser keeps in localStorage (no
--   fingerprinting); user_id is taken from the session on the server.
-- * record_listen_event(): the idempotent insert-or-update used by the route.
--   listened_seconds never decreases (beacons may arrive out of order) and is
--   capped by the wall-clock time since the session started (max 2x speed).
-- * admin_* functions: aggregates for /admin/stats and /admin/users. Days are
--   bucketed in Asia/Jerusalem. Listeners are counted by user when signed in,
--   otherwise by device.
--
-- Nothing here is reachable with the anon/authenticated keys: the table has
-- RLS on with no policies plus revoked privileges, and every function is
-- EXECUTE-able by service_role only. Depends on 009 (profiles) and 010
-- (push_subscriptions). Idempotent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.listen_events (
  id bigserial PRIMARY KEY,
  session_id uuid NOT NULL UNIQUE,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  audio_file_id uuid REFERENCES public.lesson_audio(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  device_id text CHECK (device_id IS NULL OR char_length(device_id) BETWEEN 8 AND 64),
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  listened_seconds integer NOT NULL DEFAULT 0 CHECK (listened_seconds >= 0),
  source text CHECK (source IS NULL OR source IN ('web', 'pwa', 'offline', 'driving'))
);

CREATE INDEX IF NOT EXISTS idx_listen_events_started_at
  ON public.listen_events(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_listen_events_lesson
  ON public.listen_events(lesson_id);
CREATE INDEX IF NOT EXISTS idx_listen_events_user
  ON public.listen_events(user_id, updated_at DESC)
  WHERE user_id IS NOT NULL;

ALTER TABLE public.listen_events ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: anon/authenticated get nothing, service_role bypasses RLS.
REVOKE ALL ON TABLE public.listen_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.listen_events_id_seq FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Writer
-- -----------------------------------------------------------------------------
-- Returns false when nothing was written: unknown/unpublished lesson, or the
-- session id belongs to another lesson/device/user.
CREATE OR REPLACE FUNCTION public.record_listen_event(
  p_session_id uuid,
  p_lesson_id uuid,
  p_audio_file_id uuid,
  p_user_id uuid,
  p_device_id text,
  p_listened_seconds integer,
  p_source text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- The first event of an honest client arrives after ~30-45s of listening.
  first_event_cap constant integer := 600;
  written integer;
BEGIN
  IF p_listened_seconds IS NULL OR p_listened_seconds < 0 THEN
    RETURN false;
  END IF;

  INSERT INTO public.listen_events AS e (
    session_id, lesson_id, audio_file_id, user_id, device_id,
    started_at, updated_at, listened_seconds, source
  )
  SELECT
    p_session_id,
    l.id,
    (SELECT a.id FROM public.lesson_audio a WHERE a.id = p_audio_file_id AND a.lesson_id = l.id),
    p_user_id,
    p_device_id,
    now() - make_interval(secs => LEAST(p_listened_seconds, first_event_cap)),
    now(),
    LEAST(p_listened_seconds, first_event_cap),
    p_source
  FROM public.lessons l
  WHERE l.id = p_lesson_id AND l.is_published = true
  ON CONFLICT (session_id) DO UPDATE
    SET listened_seconds = GREATEST(
          e.listened_seconds,
          LEAST(
            p_listened_seconds,
            floor(extract(epoch FROM now() - e.started_at) * 2)::integer + 120
          )
        ),
        user_id = COALESCE(e.user_id, EXCLUDED.user_id),
        source = COALESCE(EXCLUDED.source, e.source),
        updated_at = now()
    WHERE e.lesson_id = EXCLUDED.lesson_id
      AND e.device_id IS NOT DISTINCT FROM EXCLUDED.device_id
      AND (e.user_id IS NULL OR EXCLUDED.user_id IS NULL OR e.user_id = EXCLUDED.user_id);

  GET DIAGNOSTICS written = ROW_COUNT;
  RETURN written > 0;
END;
$$;

-- -----------------------------------------------------------------------------
-- Reporting helpers
-- -----------------------------------------------------------------------------
-- Start of the reporting window: midnight (Asia/Jerusalem) p_days - 1 days ago,
-- so a 7-day window is today plus the six days before it. p_days is clamped.
CREATE OR REPLACE FUNCTION public.admin_period_start(p_days integer)
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT (
    date_trunc('day', now() AT TIME ZONE 'Asia/Jerusalem')
    - make_interval(days => LEAST(GREATEST(COALESCE(p_days, 30), 1), 366) - 1)
  ) AT TIME ZONE 'Asia/Jerusalem';
$$;

-- Listens, distinct listeners and listened seconds per local day (days without
-- listens are omitted; the app fills the gaps).
CREATE OR REPLACE FUNCTION public.admin_listens_per_day(p_days integer)
RETURNS TABLE (day date, listens bigint, listeners bigint, listened_seconds bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (e.started_at AT TIME ZONE 'Asia/Jerusalem')::date AS day,
    count(*) AS listens,
    count(DISTINCT COALESCE(e.user_id::text, e.device_id, e.session_id::text)) AS listeners,
    COALESCE(sum(e.listened_seconds), 0)::bigint AS listened_seconds
  FROM public.listen_events e
  WHERE e.started_at >= public.admin_period_start(p_days)
  GROUP BY 1
  ORDER BY 1;
$$;

-- Totals for the period (distinct listeners cannot be summed from days).
CREATE OR REPLACE FUNCTION public.admin_listen_totals(p_days integer)
RETURNS TABLE (listens bigint, listeners bigint, signed_in_listeners bigint, listened_seconds bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    count(*) AS listens,
    count(DISTINCT COALESCE(e.user_id::text, e.device_id, e.session_id::text)) AS listeners,
    count(DISTINCT e.user_id) AS signed_in_listeners,
    COALESCE(sum(e.listened_seconds), 0)::bigint AS listened_seconds
  FROM public.listen_events e
  WHERE e.started_at >= public.admin_period_start(p_days);
$$;

-- Distinct listeners active (any heartbeat) in the rolling last 1/7/30 days.
CREATE OR REPLACE FUNCTION public.admin_active_listeners()
RETURNS TABLE (last_1_day bigint, last_7_days bigint, last_30_days bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    count(DISTINCT COALESCE(e.user_id::text, e.device_id, e.session_id::text))
      FILTER (WHERE e.updated_at >= now() - interval '1 day') AS last_1_day,
    count(DISTINCT COALESCE(e.user_id::text, e.device_id, e.session_id::text))
      FILTER (WHERE e.updated_at >= now() - interval '7 days') AS last_7_days,
    count(DISTINCT COALESCE(e.user_id::text, e.device_id, e.session_id::text)) AS last_30_days
  FROM public.listen_events e
  WHERE e.updated_at >= now() - interval '30 days';
$$;

-- Top lessons of the period, ordered by listens ('listens') or by listened
-- time ('minutes').
CREATE OR REPLACE FUNCTION public.admin_top_lessons(p_days integer, p_order text, p_limit integer)
RETURNS TABLE (
  lesson_id uuid,
  title text,
  hebrew_title text,
  listens bigint,
  listeners bigint,
  listened_seconds bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    l.id AS lesson_id,
    l.title,
    l.hebrew_title,
    s.listens,
    s.listeners,
    s.listened_seconds
  FROM (
    SELECT
      e.lesson_id,
      count(*) AS listens,
      count(DISTINCT COALESCE(e.user_id::text, e.device_id, e.session_id::text)) AS listeners,
      COALESCE(sum(e.listened_seconds), 0)::bigint AS listened_seconds
    FROM public.listen_events e
    WHERE e.started_at >= public.admin_period_start(p_days)
    GROUP BY e.lesson_id
  ) s
  JOIN public.lessons l ON l.id = s.lesson_id
  ORDER BY
    CASE WHEN p_order = 'minutes' THEN s.listened_seconds ELSE s.listens END DESC,
    CASE WHEN p_order = 'minutes' THEN s.listens ELSE s.listened_seconds END DESC,
    l.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 100);
$$;

-- New accounts per local day.
CREATE OR REPLACE FUNCTION public.admin_signups_per_day(p_days integer)
RETURNS TABLE (day date, signups bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (u.created_at AT TIME ZONE 'Asia/Jerusalem')::date AS day, count(*) AS signups
  FROM auth.users u
  WHERE u.created_at >= public.admin_period_start(p_days)
    AND u.deleted_at IS NULL
  GROUP BY 1
  ORDER BY 1;
$$;

-- New push subscriptions per local day (subscriptions removed since are gone).
CREATE OR REPLACE FUNCTION public.admin_push_subscribers_per_day(p_days integer)
RETURNS TABLE (day date, subscribers bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (p.created_at AT TIME ZONE 'Asia/Jerusalem')::date AS day, count(*) AS subscribers
  FROM public.push_subscriptions p
  WHERE p.created_at >= public.admin_period_start(p_days)
  GROUP BY 1
  ORDER BY 1;
$$;

-- Account / subscriber totals, overall and new in the period.
CREATE OR REPLACE FUNCTION public.admin_audience_totals(p_days integer)
RETURNS TABLE (
  users_total bigint,
  users_new bigint,
  push_subscribers_total bigint,
  push_subscribers_new bigint,
  email_opt_in bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (SELECT count(*) FROM auth.users u WHERE u.deleted_at IS NULL),
    (SELECT count(*) FROM auth.users u
      WHERE u.deleted_at IS NULL AND u.created_at >= public.admin_period_start(p_days)),
    (SELECT count(*) FROM public.push_subscriptions),
    (SELECT count(*) FROM public.push_subscriptions p
      WHERE p.created_at >= public.admin_period_start(p_days)),
    (SELECT count(*) FROM public.profiles pr
      JOIN auth.users u ON u.id = pr.id
      WHERE pr.notify_new_lessons = true
        AND u.deleted_at IS NULL
        AND u.email IS NOT NULL
        AND u.email_confirmed_at IS NOT NULL);
$$;

-- Most recent accounts.
CREATE OR REPLACE FUNCTION public.admin_recent_signups(p_limit integer)
RETURNS TABLE (user_id uuid, email text, display_name text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.id, u.email::text, p.display_name, u.created_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.deleted_at IS NULL
  ORDER BY u.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 100);
$$;

-- Per-user listening and push activity (only users that have any).
CREATE OR REPLACE FUNCTION public.admin_user_activity()
RETURNS TABLE (
  user_id uuid,
  listens bigint,
  listened_seconds bigint,
  last_listen_at timestamptz,
  push_subscriptions bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH listens AS (
    SELECT
      e.user_id,
      count(*) AS listens,
      COALESCE(sum(e.listened_seconds), 0)::bigint AS listened_seconds,
      max(e.updated_at) AS last_listen_at
    FROM public.listen_events e
    WHERE e.user_id IS NOT NULL
    GROUP BY e.user_id
  ),
  push AS (
    SELECT p.user_id, count(*) AS push_subscriptions
    FROM public.push_subscriptions p
    WHERE p.user_id IS NOT NULL
    GROUP BY p.user_id
  )
  SELECT
    COALESCE(l.user_id, p.user_id) AS user_id,
    COALESCE(l.listens, 0) AS listens,
    COALESCE(l.listened_seconds, 0) AS listened_seconds,
    l.last_listen_at,
    COALESCE(p.push_subscriptions, 0) AS push_subscriptions
  FROM listens l
  FULL JOIN push p ON p.user_id = l.user_id;
$$;

-- -----------------------------------------------------------------------------
-- Privileges: service role only.
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.record_listen_event(uuid, uuid, uuid, uuid, text, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_period_start(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_listens_per_day(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_listen_totals(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_active_listeners() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_top_lessons(integer, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_signups_per_day(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_push_subscribers_per_day(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_audience_totals(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_recent_signups(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_user_activity() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_listen_event(uuid, uuid, uuid, uuid, text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_period_start(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_listens_per_day(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_listen_totals(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_active_listeners() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_top_lessons(integer, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_signups_per_day(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_push_subscribers_per_day(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_audience_totals(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_recent_signups(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_user_activity() TO service_role;
