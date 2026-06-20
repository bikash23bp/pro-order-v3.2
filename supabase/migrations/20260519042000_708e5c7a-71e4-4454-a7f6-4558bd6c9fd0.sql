CREATE TABLE IF NOT EXISTS public.telesales_compensation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  base_amount numeric NOT NULL DEFAULT 0,
  frequency text NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('daily','weekly','monthly')),
  per_order_amount numeric NOT NULL DEFAULT 0,
  per_order_pct numeric NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.telesales_compensation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage telesales_compensation"
  ON public.telesales_compensation FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "auth view telesales_compensation"
  ON public.telesales_compensation FOR SELECT TO authenticated
  USING (true);

CREATE TRIGGER trg_telesales_compensation_updated_at
  BEFORE UPDATE ON public.telesales_compensation
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();