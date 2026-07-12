
DROP VIEW IF EXISTS public.customer_stats;

CREATE VIEW public.customer_stats AS
WITH from_orders AS (
  SELECT
    orders.phone_normalized AS phone,
    (array_agg(orders.customer_name    ORDER BY orders.created_at DESC))[1] AS name,
    (array_agg(orders.customer_email   ORDER BY orders.created_at DESC))[1] AS email,
    (array_agg(orders.customer_address ORDER BY orders.created_at DESC))[1] AS address,
    count(*)::int AS total_orders,
    count(*) FILTER (WHERE orders.status = 'completed'::order_status)::int AS completed_orders,
    count(*) FILTER (WHERE orders.status = ANY (ARRAY['cancelled'::order_status,'returned'::order_status]))::int AS cancelled_orders,
    COALESCE(sum(orders.total_amount) FILTER (WHERE orders.status <> ALL (ARRAY['cancelled'::order_status,'returned'::order_status])), 0::numeric) AS total_spent,
    max(orders.created_at) AS last_order_at,
    min(orders.created_at) AS first_order_at,
    bool_or(orders.customer_type = 'wholesale') AS is_wholesale
  FROM orders
  WHERE orders.phone_normalized IS NOT NULL AND orders.phone_normalized <> ''
  GROUP BY orders.phone_normalized
),
from_imports AS (
  SELECT
    NULLIF(right(regexp_replace(COALESCE(imported_customers.phone,''), '\D', '', 'g'), 11), '') AS phone,
    (array_agg(imported_customers.name    ORDER BY imported_customers.created_at DESC))[1] AS name,
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
  WHERE imported_customers.phone IS NOT NULL
    AND NULLIF(right(regexp_replace(COALESCE(imported_customers.phone,''), '\D', '', 'g'), 11), '') IS NOT NULL
  GROUP BY 1
)
SELECT
  COALESCE(o.phone, i.phone) AS phone,
  COALESCE(o.name, i.name) AS name,
  o.email AS email,
  COALESCE(o.address, i.address) AS address,
  COALESCE(o.total_orders, 0) AS total_orders,
  COALESCE(o.completed_orders, 0) AS completed_orders,
  COALESCE(o.cancelled_orders, 0) AS cancelled_orders,
  COALESCE(o.total_spent, 0::numeric) AS total_spent,
  o.last_order_at AS last_order_at,
  o.first_order_at AS first_order_at,
  COALESCE(o.is_wholesale, false) AS is_wholesale
FROM from_orders o
FULL JOIN from_imports i ON i.phone = o.phone;

GRANT SELECT ON public.customer_stats TO authenticated;
GRANT SELECT ON public.customer_stats TO service_role;
