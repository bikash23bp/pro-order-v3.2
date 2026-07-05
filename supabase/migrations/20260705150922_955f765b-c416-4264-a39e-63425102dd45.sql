CREATE OR REPLACE FUNCTION public.get_order_counts_summary_v1()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH rows AS (
    SELECT bucket_type, bucket_key, order_count, total_amount
    FROM public.order_status_counts
  )
  SELECT jsonb_build_object(
    'byStatus', COALESCE((
      SELECT jsonb_object_agg(bucket_key, jsonb_build_object('count', order_count, 'amount', total_amount))
      FROM rows
      WHERE bucket_type = 'status'
    ), '{}'::jsonb),
    'all', COALESCE((
      SELECT jsonb_build_object('count', order_count, 'amount', total_amount)
      FROM rows
      WHERE bucket_type = 'all' AND bucket_key = 'all'
    ), jsonb_build_object('count', 0, 'amount', 0)),
    'web', COALESCE((
      SELECT jsonb_build_object('count', order_count, 'amount', total_amount)
      FROM rows
      WHERE bucket_type = 'source' AND bucket_key = 'woocommerce'
    ), jsonb_build_object('count', 0, 'amount', 0)),
    'facebook', COALESCE((
      SELECT jsonb_build_object('count', order_count, 'amount', total_amount)
      FROM rows
      WHERE bucket_type = 'source' AND bucket_key = 'facebook'
    ), jsonb_build_object('count', 0, 'amount', 0)),
    'partner', COALESCE((
      SELECT jsonb_build_object('count', order_count, 'amount', total_amount)
      FROM rows
      WHERE bucket_type = 'source' AND bucket_key = 'oms'
    ), jsonb_build_object('count', 0, 'amount', 0)),
    'preorder', COALESCE((
      SELECT jsonb_build_object('count', order_count, 'amount', total_amount)
      FROM rows
      WHERE bucket_type = 'preorder' AND bucket_key = 'true'
    ), jsonb_build_object('count', 0, 'amount', 0))
  );
$$;

CREATE OR REPLACE FUNCTION public.get_order_item_previews_v1(p_order_ids uuid[])
RETURNS TABLE(order_id uuid, item_count integer, preview_items jsonb)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    ids.order_id,
    COALESCE(cnt.item_count, 0)::integer AS item_count,
    COALESCE(prev.preview_items, '[]'::jsonb) AS preview_items
  FROM unnest(COALESCE(p_order_ids, ARRAY[]::uuid[])) AS ids(order_id)
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::integer AS item_count
    FROM public.order_items oi
    WHERE oi.order_id = ids.order_id
  ) cnt ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'quantity', x.quantity,
        'products', jsonb_build_object('name', x.product_name)
      )
      ORDER BY x.created_at ASC, x.id ASC
    ) AS preview_items
    FROM (
      SELECT oi.id, oi.created_at, oi.quantity, p.name AS product_name
      FROM public.order_items oi
      LEFT JOIN public.products p ON p.id = oi.product_id
      WHERE oi.order_id = ids.order_id
      ORDER BY oi.created_at ASC, oi.id ASC
      LIMIT 2
    ) x
  ) prev ON true;
$$;

REVOKE ALL ON FUNCTION public.get_order_counts_summary_v1() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_order_item_previews_v1(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_order_counts_summary_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_item_previews_v1(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_counts_summary_v1() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_order_item_previews_v1(uuid[]) TO service_role;

REVOKE ALL ON FUNCTION public.bump_order_status_count(text, text, integer, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_order_status_count_delta(public.orders, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_order_status_counts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_order_status_counts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_order_status_count(text, text, integer, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_order_status_count_delta(public.orders, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_order_status_counts() TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_order_status_counts() TO service_role;