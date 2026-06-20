DO $$ BEGIN
  CREATE TYPE public.complaint_category AS ENUM ('damage','wrong_item','missing_item','late_delivery','refund_pending','quality','behavior','other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.complaint_severity AS ENUM ('low','medium','high');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.complaint_status AS ENUM ('open','in_progress','resolved','dismissed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE OR REPLACE FUNCTION public.set_complaints_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE IF NOT EXISTS public.customer_complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  customer_name text,
  order_id uuid,
  category public.complaint_category NOT NULL DEFAULT 'other',
  severity public.complaint_severity NOT NULL DEFAULT 'medium',
  status public.complaint_status NOT NULL DEFAULT 'open',
  note text NOT NULL,
  resolution_note text,
  created_by uuid,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_complaints_phone ON public.customer_complaints(phone);
CREATE INDEX IF NOT EXISTS idx_customer_complaints_status ON public.customer_complaints(status);
CREATE INDEX IF NOT EXISTS idx_customer_complaints_created_at ON public.customer_complaints(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_complaints_created_by ON public.customer_complaints(created_by);

ALTER TABLE public.customer_complaints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth view customer_complaints" ON public.customer_complaints;
CREATE POLICY "auth view customer_complaints" ON public.customer_complaints
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth insert customer_complaints" ON public.customer_complaints;
CREATE POLICY "auth insert customer_complaints" ON public.customer_complaints
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "owners or admin update customer_complaints" ON public.customer_complaints;
CREATE POLICY "owners or admin update customer_complaints" ON public.customer_complaints
  FOR UPDATE TO authenticated
  USING (created_by = (SELECT auth.uid()) OR public.has_role((SELECT auth.uid()),'admin'::app_role))
  WITH CHECK (created_by = (SELECT auth.uid()) OR public.has_role((SELECT auth.uid()),'admin'::app_role));

DROP POLICY IF EXISTS "owners or admin delete customer_complaints" ON public.customer_complaints;
CREATE POLICY "owners or admin delete customer_complaints" ON public.customer_complaints
  FOR DELETE TO authenticated
  USING (created_by = (SELECT auth.uid()) OR public.has_role((SELECT auth.uid()),'admin'::app_role));

DROP TRIGGER IF EXISTS trg_customer_complaints_updated_at ON public.customer_complaints;
CREATE TRIGGER trg_customer_complaints_updated_at
  BEFORE UPDATE ON public.customer_complaints
  FOR EACH ROW EXECUTE FUNCTION public.set_complaints_updated_at();
