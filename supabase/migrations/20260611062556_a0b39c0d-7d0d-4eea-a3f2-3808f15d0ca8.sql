CREATE OR REPLACE VIEW public.incomplete_orders AS
WITH item_counts AS (
  SELECT order_items.order_id, count(*)::integer AS item_count
  FROM order_items
  GROUP BY order_items.order_id
)
SELECT
  o.id, o.order_number, o.customer_name, o.customer_phone, o.customer_email,
  o.customer_address, o.status, o.subtotal, o.discount_amount, o.advance_amount,
  o.delivery_charge, o.total_amount, o.courier_id, o.consignment_id, o.tracking_url,
  o.internal_note, o.invoice_note, o.created_by, o.created_at, o.updated_at,
  o.external_order_id, o.source, o.phone_normalized, o.source_site_id, o.preorder,
  o.cross_sale, o.delivery_method, o.order_source_id, o.invoice_number,
  o.preorder_date, o.updated_by, o.advance_source_id, o.advance_txn_id,
  o.is_paid_marketing,
  array_remove(ARRAY[
    CASE WHEN COALESCE(o.customer_address,'') = ANY (ARRAY['','—','-']) THEN 'address' ELSE NULL END,
    CASE WHEN length(regexp_replace(COALESCE(o.customer_phone,''),'[^0-9]','','g')) < 11 THEN 'phone' ELSE NULL END,
    CASE WHEN COALESCE(ic.item_count, 0) = 0 THEN 'items' ELSE NULL END,
    CASE WHEN COALESCE(o.total_amount, 0::numeric) = 0::numeric THEN 'total' ELSE NULL END
  ], NULL::text) AS missing_fields
FROM orders o
LEFT JOIN item_counts ic ON ic.order_id = o.id
WHERE o.preorder IS NOT TRUE
  AND o.status <> 'completed'::order_status
  AND length(regexp_replace(COALESCE(o.customer_phone,''),'[^0-9]','','g')) >= 11;

GRANT SELECT ON public.incomplete_orders TO authenticated;
GRANT SELECT ON public.incomplete_orders TO service_role;