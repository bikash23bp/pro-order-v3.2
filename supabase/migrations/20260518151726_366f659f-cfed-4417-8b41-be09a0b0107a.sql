CREATE TABLE IF NOT EXISTS public.customer_tag_discounts (
  tag public.customer_tag PRIMARY KEY,
  rate numeric NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.customer_tag_discounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth view customer_tag_discounts"
  ON public.customer_tag_discounts FOR SELECT TO authenticated USING (true);

CREATE POLICY "admins manage customer_tag_discounts"
  ON public.customer_tag_discounts FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_customer_tag_discounts_updated_at
  BEFORE UPDATE ON public.customer_tag_discounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed one row per tag (rate 0, disabled by default)
INSERT INTO public.customer_tag_discounts (tag, rate, enabled)
SELECT unnest(enum_range(NULL::public.customer_tag)), 0, false
ON CONFLICT (tag) DO NOTHING;