
-- Staff session tracking for live dashboard & reports
CREATE TABLE IF NOT EXISTS public.staff_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_sessions_user_started
  ON public.staff_sessions (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_sessions_started_at
  ON public.staff_sessions (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_sessions_open
  ON public.staff_sessions (user_id) WHERE ended_at IS NULL;

ALTER TABLE public.staff_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins view all sessions"
  ON public.staff_sessions FOR SELECT
  TO authenticated
  USING (has_role((SELECT auth.uid()), 'admin'::app_role));

CREATE POLICY "users view own sessions"
  ON public.staff_sessions FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Replace heartbeat: updates profile last_seen AND manages sessions
CREATE OR REPLACE FUNCTION public.heartbeat()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  open_id uuid;
  open_last_seen timestamptz;
BEGIN
  IF uid IS NULL THEN RETURN; END IF;

  UPDATE public.profiles SET last_seen_at = now() WHERE id = uid;

  SELECT id, last_seen_at INTO open_id, open_last_seen
    FROM public.staff_sessions
   WHERE user_id = uid AND ended_at IS NULL
   ORDER BY started_at DESC LIMIT 1;

  IF open_id IS NOT NULL THEN
    IF open_last_seen > now() - interval '5 minutes' THEN
      -- Extend current session
      UPDATE public.staff_sessions
         SET last_seen_at = now()
       WHERE id = open_id;
      RETURN;
    ELSE
      -- Stale: close it
      UPDATE public.staff_sessions
         SET ended_at = open_last_seen,
             duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (open_last_seen - started_at))::int)
       WHERE id = open_id;
    END IF;
  END IF;

  -- Start a new session
  INSERT INTO public.staff_sessions (user_id) VALUES (uid);
END;
$$;

GRANT EXECUTE ON FUNCTION public.heartbeat() TO authenticated;

-- Helper: close stale open sessions (callable for cleanup; used in reports)
CREATE OR REPLACE FUNCTION public.close_stale_staff_sessions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  WITH upd AS (
    UPDATE public.staff_sessions
       SET ended_at = last_seen_at,
           duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (last_seen_at - started_at))::int)
     WHERE ended_at IS NULL
       AND last_seen_at < now() - interval '5 minutes'
     RETURNING 1
  ) SELECT count(*) INTO n FROM upd;
  RETURN COALESCE(n, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_stale_staff_sessions() TO authenticated;
