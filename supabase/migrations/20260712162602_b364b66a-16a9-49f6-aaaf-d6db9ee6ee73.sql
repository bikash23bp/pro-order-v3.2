
-- 1) cancel_reasons table
CREATE TABLE IF NOT EXISTS public.cancel_reasons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  label TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cancel_reasons_label_unique ON public.cancel_reasons (lower(label));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cancel_reasons TO authenticated;
GRANT ALL ON public.cancel_reasons TO service_role;

ALTER TABLE public.cancel_reasons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth read cancel_reasons" ON public.cancel_reasons;
CREATE POLICY "auth read cancel_reasons" ON public.cancel_reasons
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth manage cancel_reasons" ON public.cancel_reasons;
CREATE POLICY "auth manage cancel_reasons" ON public.cancel_reasons
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_cancel_reasons_updated_at ON public.cancel_reasons;
CREATE TRIGGER trg_cancel_reasons_updated_at
BEFORE UPDATE ON public.cancel_reasons
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) Seed demo reasons (only if table is empty)
INSERT INTO public.cancel_reasons (label, sort_order)
SELECT * FROM (VALUES
  ('Phone Off', 10),
  ('Price Too High', 20),
  ('Duplicate Order', 30),
  ('Wrong Address', 40),
  ('Customer Unavailable', 50),
  ('Out of Delivery Area', 60),
  ('Changed Mind', 70)
) AS v(label, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.cancel_reasons);

-- 3) orders.cancel_reason_id column
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cancel_reason_id UUID REFERENCES public.cancel_reasons(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_cancel_reason_id_idx
  ON public.orders (cancel_reason_id)
  WHERE cancel_reason_id IS NOT NULL;
