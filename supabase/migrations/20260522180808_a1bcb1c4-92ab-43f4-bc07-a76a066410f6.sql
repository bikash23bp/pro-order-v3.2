
CREATE TABLE public.inactivity_lock_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  locked_at timestamptz NOT NULL DEFAULT now(),
  unlocked_at timestamptz,
  duration_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inactivity_lock_events_user_locked_at
  ON public.inactivity_lock_events (user_id, locked_at DESC);

ALTER TABLE public.inactivity_lock_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth view inactivity_lock_events"
  ON public.inactivity_lock_events FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "users insert own inactivity_lock_events"
  ON public.inactivity_lock_events FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "users update own inactivity_lock_events"
  ON public.inactivity_lock_events FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()) OR has_role((SELECT auth.uid()), 'admin'::app_role))
  WITH CHECK (user_id = (SELECT auth.uid()) OR has_role((SELECT auth.uid()), 'admin'::app_role));

CREATE POLICY "admins delete inactivity_lock_events"
  ON public.inactivity_lock_events FOR DELETE
  TO authenticated
  USING (has_role((SELECT auth.uid()), 'admin'::app_role));
