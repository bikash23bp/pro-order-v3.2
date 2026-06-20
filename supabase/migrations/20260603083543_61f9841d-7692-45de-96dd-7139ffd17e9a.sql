-- Backfill existing woocommerce_incomplete rows to status='incomplete'
UPDATE public.orders
   SET status = 'incomplete'::public.order_status
 WHERE source = 'woocommerce_incomplete'
   AND status = 'hold'::public.order_status;

-- Refresh the incomplete_orders view to also include status='incomplete'
CREATE OR REPLACE VIEW public.incomplete_orders AS
WITH item_counts AS (
  SELECT order_items.order_id, count(*)::integer AS item_count
  FROM public.order_items
  GROUP BY order_items.order_id
)
SELECT o.id, o.order_number, o.customer_name, o.customer_phone, o.customer_email,
       o.customer_address, o.status, o.subtotal, o.discount_amount, o.advance_amount,
       o.delivery_charge, o.total_amount, o.courier_id, o.consignment_id,
       o.tracking_url, o.internal_note, o.invoice_note, o.created_by, o.created_at,
       o.updated_at, o.external_order_id, o.source, o.phone_normalized,
       o.source_site_id, o.preorder, o.cross_sale, o.delivery_method,
       o.order_source_id, o.invoice_number, o.preorder_date, o.updated_by,
       o.advance_source_id, o.advance_txn_id, o.is_paid_marketing,
       array_remove(ARRAY[
         CASE WHEN COALESCE(o.customer_address,'') = ANY(ARRAY['','—','-']) THEN 'address' END,
         CASE WHEN length(regexp_replace(COALESCE(o.customer_phone,''),'[^0-9]','','g')) < 11 THEN 'phone' END,
         CASE WHEN COALESCE(ic.item_count,0) = 0 THEN 'items' END,
         CASE WHEN COALESCE(o.total_amount,0) = 0 THEN 'total' END
       ], NULL) AS missing_fields
FROM public.orders o
LEFT JOIN item_counts ic ON ic.order_id = o.id
WHERE o.preorder IS NOT TRUE
  AND (
    (o.source = 'woocommerce_incomplete'
       AND o.status = ANY(ARRAY['incomplete'::public.order_status, 'hold'::public.order_status, 'processing'::public.order_status]))
    OR (
      o.status = ANY(ARRAY['incomplete'::public.order_status, 'processing'::public.order_status, 'hold'::public.order_status])
      AND (
        COALESCE(o.customer_address,'') = ANY(ARRAY['','—','-'])
        OR length(regexp_replace(COALESCE(o.customer_phone,''),'[^0-9]','','g')) < 11
        OR COALESCE(o.total_amount,0) = 0
        OR COALESCE(ic.item_count,0) = 0
      )
    )
  );

GRANT SELECT ON public.incomplete_orders TO authenticated, service_role;