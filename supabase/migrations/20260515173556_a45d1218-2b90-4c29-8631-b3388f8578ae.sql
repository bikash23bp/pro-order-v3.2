
-- 1. Multi-site integrations
ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS name text;

-- Drop existing unique on provider (set up by earlier migration via upsert onConflict)
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.integrations'::regclass
      AND contype IN ('u','p')
      AND conname <> 'integrations_pkey'
  LOOP
    EXECUTE format('ALTER TABLE public.integrations DROP CONSTRAINT %I', c.conname);
  END LOOP;
END$$;

-- Enforce max 5 woocommerce rows
CREATE OR REPLACE FUNCTION public.enforce_max_integrations()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (SELECT count(*) FROM public.integrations WHERE provider = NEW.provider) >= 5
     AND (TG_OP = 'INSERT' OR (TG_OP='UPDATE' AND OLD.provider <> NEW.provider))
  THEN
    RAISE EXCEPTION 'Max 5 % integrations allowed', NEW.provider USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_max_integrations ON public.integrations;
CREATE TRIGGER trg_max_integrations
BEFORE INSERT OR UPDATE ON public.integrations
FOR EACH ROW EXECUTE FUNCTION public.enforce_max_integrations();

-- 2. Source site on orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS source_site_id uuid REFERENCES public.integrations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_source_site ON public.orders(source_site_id);

-- 3. Imported customers
CREATE TABLE IF NOT EXISTS public.imported_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  phone text NOT NULL,
  address text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_imported_customers_phone ON public.imported_customers(btrim(phone));

ALTER TABLE public.imported_customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth view imported_customers" ON public.imported_customers;
CREATE POLICY "auth view imported_customers" ON public.imported_customers
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admins manage imported_customers" ON public.imported_customers;
CREATE POLICY "admins manage imported_customers" ON public.imported_customers
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 4. Update customer_stats view to union imported customers
CREATE OR REPLACE VIEW public.customer_stats AS
WITH from_orders AS (
  SELECT btrim(customer_phone) AS phone,
    (array_agg(customer_name ORDER BY created_at DESC))[1] AS name,
    (array_agg(customer_email ORDER BY created_at DESC))[1] AS email,
    (array_agg(customer_address ORDER BY created_at DESC))[1] AS address,
    count(*)::integer AS total_orders,
    count(*) FILTER (WHERE status = 'completed'::order_status)::integer AS completed_orders,
    count(*) FILTER (WHERE status = ANY (ARRAY['cancelled'::order_status, 'returned'::order_status]))::integer AS cancelled_orders,
    COALESCE(sum(total_amount) FILTER (WHERE status <> ALL (ARRAY['cancelled'::order_status, 'returned'::order_status])), 0::numeric) AS total_spent,
    max(created_at) AS last_order_at,
    min(created_at) AS first_order_at
  FROM orders
  WHERE customer_phone IS NOT NULL AND btrim(customer_phone) <> ''
  GROUP BY btrim(customer_phone)
),
from_imports AS (
  SELECT btrim(phone) AS phone,
    (array_agg(name ORDER BY created_at DESC))[1] AS name,
    NULL::text AS email,
    (array_agg(address ORDER BY created_at DESC))[1] AS address,
    0::integer AS total_orders,
    0::integer AS completed_orders,
    0::integer AS cancelled_orders,
    0::numeric AS total_spent,
    NULL::timestamptz AS last_order_at,
    NULL::timestamptz AS first_order_at
  FROM imported_customers
  WHERE phone IS NOT NULL AND btrim(phone) <> ''
  GROUP BY btrim(phone)
)
SELECT
  COALESCE(o.phone, i.phone) AS phone,
  COALESCE(o.name, i.name) AS name,
  o.email,
  COALESCE(o.address, i.address) AS address,
  COALESCE(o.total_orders, 0) AS total_orders,
  COALESCE(o.completed_orders, 0) AS completed_orders,
  COALESCE(o.cancelled_orders, 0) AS cancelled_orders,
  COALESCE(o.total_spent, 0) AS total_spent,
  o.last_order_at,
  COALESCE(o.first_order_at, NULL) AS first_order_at
FROM from_orders o
FULL OUTER JOIN from_imports i ON i.phone = o.phone;
