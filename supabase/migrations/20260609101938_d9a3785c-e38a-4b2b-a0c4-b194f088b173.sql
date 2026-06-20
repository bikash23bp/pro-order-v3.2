
-- 1) Add customer_type to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_type text NOT NULL DEFAULT 'retail';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_customer_type_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_customer_type_check
      CHECK (customer_type IN ('retail','wholesale'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_customer_type ON public.orders(customer_type);

-- 2) Recreate customer_stats view with is_wholesale flag
DROP VIEW IF EXISTS public.customer_stats;

CREATE VIEW public.customer_stats
WITH (security_invoker=true) AS
WITH from_orders AS (
  SELECT btrim(orders.customer_phone) AS phone,
    (array_agg(orders.customer_name ORDER BY orders.created_at DESC))[1] AS name,
    (array_agg(orders.customer_email ORDER BY orders.created_at DESC))[1] AS email,
    (array_agg(orders.customer_address ORDER BY orders.created_at DESC))[1] AS address,
    count(*)::integer AS total_orders,
    count(*) FILTER (WHERE orders.status = 'completed'::order_status)::integer AS completed_orders,
    count(*) FILTER (WHERE orders.status = ANY (ARRAY['cancelled'::order_status,'returned'::order_status]))::integer AS cancelled_orders,
    COALESCE(sum(orders.total_amount) FILTER (WHERE orders.status <> ALL (ARRAY['cancelled'::order_status,'returned'::order_status])), 0::numeric) AS total_spent,
    max(orders.created_at) AS last_order_at,
    min(orders.created_at) AS first_order_at,
    bool_or(orders.customer_type = 'wholesale') AS is_wholesale
  FROM orders
  WHERE orders.customer_phone IS NOT NULL AND btrim(orders.customer_phone) <> ''
  GROUP BY btrim(orders.customer_phone)
), from_imports AS (
  SELECT btrim(imported_customers.phone) AS phone,
    (array_agg(imported_customers.name ORDER BY imported_customers.created_at DESC))[1] AS name,
    NULL::text AS email,
    (array_agg(imported_customers.address ORDER BY imported_customers.created_at DESC))[1] AS address,
    0 AS total_orders,
    0 AS completed_orders,
    0 AS cancelled_orders,
    0::numeric AS total_spent,
    NULL::timestamptz AS last_order_at,
    NULL::timestamptz AS first_order_at,
    false AS is_wholesale
  FROM imported_customers
  WHERE imported_customers.phone IS NOT NULL AND btrim(imported_customers.phone) <> ''
  GROUP BY btrim(imported_customers.phone)
)
SELECT COALESCE(o.phone, i.phone) AS phone,
  COALESCE(o.name, i.name) AS name,
  o.email,
  COALESCE(o.address, i.address) AS address,
  COALESCE(o.total_orders, 0) AS total_orders,
  COALESCE(o.completed_orders, 0) AS completed_orders,
  COALESCE(o.cancelled_orders, 0) AS cancelled_orders,
  COALESCE(o.total_spent, 0::numeric) AS total_spent,
  o.last_order_at,
  COALESCE(o.first_order_at, NULL::timestamptz) AS first_order_at,
  COALESCE(o.is_wholesale, false) AS is_wholesale
FROM from_orders o
FULL JOIN from_imports i ON i.phone = o.phone;

GRANT SELECT ON public.customer_stats TO authenticated;
GRANT SELECT ON public.customer_stats TO service_role;
