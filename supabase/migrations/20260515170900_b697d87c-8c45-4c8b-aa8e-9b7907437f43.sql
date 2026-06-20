
-- Normalized phone (digits only, last 11) for duplicate detection
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS phone_normalized text
  GENERATED ALWAYS AS (
    NULLIF(RIGHT(REGEXP_REPLACE(COALESCE(customer_phone, ''), '[^0-9]', '', 'g'), 11), '')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_orders_phone_normalized ON public.orders(phone_normalized);

-- Helper: count other orders with same normalized phone
CREATE OR REPLACE FUNCTION public.count_orders_by_phone(p_phone text, p_exclude_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM public.orders
  WHERE phone_normalized = NULLIF(RIGHT(REGEXP_REPLACE(COALESCE(p_phone, ''), '[^0-9]', '', 'g'), 11), '')
    AND phone_normalized IS NOT NULL
    AND (p_exclude_id IS NULL OR id <> p_exclude_id);
$$;

-- Incomplete orders view (security_invoker so RLS applies as caller)
CREATE OR REPLACE VIEW public.incomplete_orders
WITH (security_invoker = true) AS
SELECT
  o.id,
  o.order_number,
  o.customer_name,
  o.customer_phone,
  o.customer_address,
  o.status,
  o.total_amount,
  o.subtotal,
  o.delivery_charge,
  o.discount_amount,
  o.advance_amount,
  o.source,
  o.created_at,
  o.updated_at,
  ARRAY_REMOVE(ARRAY[
    CASE WHEN o.customer_address IS NULL OR LENGTH(BTRIM(o.customer_address)) < 5 THEN 'address' END,
    CASE WHEN o.customer_phone IS NULL OR LENGTH(REGEXP_REPLACE(COALESCE(o.customer_phone,''),'[^0-9]','','g')) < 7 THEN 'phone' END,
    CASE WHEN NOT EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id = o.id) THEN 'items' END,
    CASE WHEN COALESCE(o.total_amount, 0) = 0 THEN 'total' END
  ], NULL) AS missing_fields
FROM public.orders o
WHERE o.status NOT IN ('completed','cancelled','returned')
  AND (
    o.customer_address IS NULL OR LENGTH(BTRIM(o.customer_address)) < 5
    OR o.customer_phone IS NULL OR LENGTH(REGEXP_REPLACE(COALESCE(o.customer_phone,''),'[^0-9]','','g')) < 7
    OR COALESCE(o.total_amount, 0) = 0
    OR NOT EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id = o.id)
  );
