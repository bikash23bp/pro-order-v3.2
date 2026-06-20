-- Enums
DO $$ BEGIN
  CREATE TYPE public.telesales_status AS ENUM ('pending', 'complete', 'hold');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.telesales_action AS ENUM (
    'phone_off', 'not_received', 'will_take_later', 'fraud', 'call_back_later'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Assignments
CREATE TABLE IF NOT EXISTS public.telesales_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  assigned_to uuid,
  status public.telesales_status NOT NULL DEFAULT 'pending',
  last_action public.telesales_action,
  note text,
  last_contacted_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id)
);

CREATE INDEX IF NOT EXISTS idx_telesales_assignments_assigned_to ON public.telesales_assignments(assigned_to);
CREATE INDEX IF NOT EXISTS idx_telesales_assignments_status ON public.telesales_assignments(status);

ALTER TABLE public.telesales_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage telesales_assignments"
  ON public.telesales_assignments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "staff view own telesales_assignments"
  ON public.telesales_assignments FOR SELECT TO authenticated
  USING (assigned_to = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "staff update own telesales_assignments"
  ON public.telesales_assignments FOR UPDATE TO authenticated
  USING (assigned_to = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_telesales_assignments_updated_at
  BEFORE UPDATE ON public.telesales_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Call logs
CREATE TABLE IF NOT EXISTS public.telesales_call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.telesales_assignments(id) ON DELETE CASCADE,
  action public.telesales_action,
  status_to public.telesales_status,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telesales_call_logs_assignment ON public.telesales_call_logs(assignment_id);

ALTER TABLE public.telesales_call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth view telesales_call_logs"
  ON public.telesales_call_logs FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.telesales_assignments a
      WHERE a.id = assignment_id AND a.assigned_to = auth.uid()
    )
  );

CREATE POLICY "auth create telesales_call_logs"
  ON public.telesales_call_logs FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.telesales_assignments a
      WHERE a.id = assignment_id AND a.assigned_to = auth.uid()
    )
  );
