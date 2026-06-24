-- =============================================================
-- customer_reviews — star ratings + notes per customer / order
-- Run this on the AUDIT project (aecaylmfhggcmekzuwcu).
-- =============================================================

CREATE TABLE IF NOT EXISTS public.customer_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  customer_name text,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_reviews_phone ON public.customer_reviews(phone);
CREATE INDEX IF NOT EXISTS idx_customer_reviews_order_id ON public.customer_reviews(order_id);
CREATE INDEX IF NOT EXISTS idx_customer_reviews_created_at ON public.customer_reviews(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_reviews TO authenticated;
GRANT ALL ON public.customer_reviews TO service_role;

ALTER TABLE public.customer_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read reviews" ON public.customer_reviews;
CREATE POLICY "authenticated read reviews" ON public.customer_reviews
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated insert reviews" ON public.customer_reviews;
CREATE POLICY "authenticated insert reviews" ON public.customer_reviews
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "owner or admin update reviews" ON public.customer_reviews;
CREATE POLICY "owner or admin update reviews" ON public.customer_reviews
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'business_owner'))
  WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'business_owner'));

DROP POLICY IF EXISTS "owner or admin delete reviews" ON public.customer_reviews;
CREATE POLICY "owner or admin delete reviews" ON public.customer_reviews
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'business_owner'));

CREATE OR REPLACE FUNCTION public.update_customer_reviews_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_customer_reviews_updated_at ON public.customer_reviews;
CREATE TRIGGER trg_customer_reviews_updated_at
  BEFORE UPDATE ON public.customer_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_customer_reviews_updated_at();
