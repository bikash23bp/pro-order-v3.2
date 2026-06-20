
-- 1. Settings toggle
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS live_monitoring_enabled boolean NOT NULL DEFAULT false;

-- 2. staff_sessions
CREATE TABLE IF NOT EXISTS public.staff_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  login_time timestamptz NOT NULL DEFAULT now(),
  logout_time timestamptz,
  last_activity timestamptz NOT NULL DEFAULT now(),
  current_page text,
  status text NOT NULL DEFAULT 'online',
  is_online boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_sessions_staff_idx ON public.staff_sessions(staff_id, login_time DESC);
CREATE INDEX IF NOT EXISTS staff_sessions_online_idx ON public.staff_sessions(is_online) WHERE is_online = true;

ALTER TABLE public.staff_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage staff_sessions"
  ON public.staff_sessions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "staff view own sessions"
  ON public.staff_sessions FOR SELECT TO authenticated
  USING (staff_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "staff insert own sessions"
  ON public.staff_sessions FOR INSERT TO authenticated
  WITH CHECK (staff_id = auth.uid());

CREATE POLICY "staff update own sessions"
  ON public.staff_sessions FOR UPDATE TO authenticated
  USING (staff_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_staff_sessions_updated_at
  BEFORE UPDATE ON public.staff_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. staff_activity_logs
CREATE TABLE IF NOT EXISTS public.staff_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action text NOT NULL,
  module text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_activity_logs_staff_idx ON public.staff_activity_logs(staff_id, created_at DESC);
CREATE INDEX IF NOT EXISTS staff_activity_logs_module_idx ON public.staff_activity_logs(module, created_at DESC);

ALTER TABLE public.staff_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins view staff_activity_logs"
  ON public.staff_activity_logs FOR SELECT TO authenticated
  USING (staff_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "staff insert own activity"
  ON public.staff_activity_logs FOR INSERT TO authenticated
  WITH CHECK (staff_id = auth.uid());

CREATE POLICY "admins delete staff_activity_logs"
  ON public.staff_activity_logs FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 4. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_activity_logs;
ALTER TABLE public.staff_sessions REPLICA IDENTITY FULL;
