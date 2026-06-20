CREATE TABLE public.advance_payment_sources (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  requires_txn_id boolean NOT NULL DEFAULT false,
  visible boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.advance_payment_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth view advance_payment_sources"
  ON public.advance_payment_sources FOR SELECT TO authenticated USING (true);

CREATE POLICY "admins manage advance_payment_sources"
  ON public.advance_payment_sources FOR ALL TO authenticated
  USING (has_role((SELECT auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((SELECT auth.uid()), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.touch_advance_payment_sources_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_advance_payment_sources_updated_at
BEFORE UPDATE ON public.advance_payment_sources
FOR EACH ROW EXECUTE FUNCTION public.touch_advance_payment_sources_updated_at();

INSERT INTO public.advance_payment_sources (name, requires_txn_id, sort_order) VALUES
  ('Cash', false, 1),
  ('bKash', true, 2),
  ('Nagad', true, 3),
  ('Rocket', true, 4),
  ('Upay', true, 5),
  ('mCash', true, 6),
  ('Bank Transfer', true, 7);

ALTER TABLE public.orders
  ADD COLUMN advance_source_id uuid REFERENCES public.advance_payment_sources(id) ON DELETE SET NULL,
  ADD COLUMN advance_txn_id text;

CREATE OR REPLACE FUNCTION public.validate_advance_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.advance_amount, 0) <= 0 THEN
    NEW.advance_source_id := NULL;
    NEW.advance_txn_id := NULL;
  ELSE
    IF NEW.advance_source_id IS NULL THEN
      RAISE EXCEPTION 'Advance payment source is required when advance amount is greater than 0';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_advance_payment_trigger
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.validate_advance_payment();