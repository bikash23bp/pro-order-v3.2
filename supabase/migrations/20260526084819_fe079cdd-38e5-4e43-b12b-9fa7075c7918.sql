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
    CASE WHEN o.customer_phone  IS NULL OR LENGTH(REGEXP_REPLACE(COALESCE(o.customer_phone,''),'[^0-9]','','g')) < 7 THEN 'phone' END,
    CASE WHEN NOT EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id = o.id) THEN 'items' END,
    CASE WHEN COALESCE(o.total_amount, 0) = 0 THEN 'total' END
  ], NULL) AS missing_fields
FROM public.orders o
WHERE o.status IN ('pending_web','processing')
  AND (
    o.source = 'woocommerce_incomplete'
    OR o.customer_address IS NULL OR LENGTH(BTRIM(o.customer_address)) < 5
    OR o.customer_phone  IS NULL OR LENGTH(REGEXP_REPLACE(COALESCE(o.customer_phone,''),'[^0-9]','','g')) < 7
    OR COALESCE(o.total_amount, 0) = 0
    OR NOT EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id = o.id)
  );