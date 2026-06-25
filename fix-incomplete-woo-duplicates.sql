-- =============================================================
-- Fix existing Woo placed-order vs incomplete-order duplicates
-- Safe to run on the audit project. It only deletes OMS rows that are still
-- source='woocommerce_incomplete' and have a real source='woocommerce' order
-- from the same site with the same normalized phone, created AFTER the
-- incomplete row within the same 14-day checkout window.
-- =============================================================

CREATE INDEX IF NOT EXISTS idx_orders_woo_site_phone_source_status
  ON public.orders (source_site_id, phone_normalized, source, status, created_at)
  WHERE phone_normalized IS NOT NULL;

WITH obsolete AS (
  SELECT i.id
  FROM public.orders i
  WHERE i.source = 'woocommerce_incomplete'
    AND i.status = 'incomplete'
    AND i.phone_normalized IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.orders r
      WHERE r.source = 'woocommerce'
        AND r.source_site_id = i.source_site_id
        AND r.phone_normalized = i.phone_normalized
        AND r.created_at >= i.created_at
        AND r.created_at <= i.created_at + interval '14 days'
    )
), deleted_items AS (
  DELETE FROM public.order_items oi
  USING obsolete o
  WHERE oi.order_id = o.id
  RETURNING oi.id
)
DELETE FROM public.orders ord
USING obsolete o
WHERE ord.id = o.id;

ANALYZE public.orders;