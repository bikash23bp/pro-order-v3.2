CREATE OR REPLACE FUNCTION public.get_dashboard_minimal(
  p_main_from timestamp with time zone, p_main_to timestamp with time zone,
  p_today_from timestamp with time zone, p_today_to timestamp with time zone,
  p_this_month_from timestamp with time zone, p_this_month_to timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '28000';
  END IF;

  WITH
  oi AS (
    SELECT order_id, SUM(quantity)::numeric AS qty
    FROM public.order_items
    WHERE order_id IN (
      SELECT id FROM public.orders
      WHERE created_at >= LEAST(p_main_from, p_today_from, p_this_month_from)
        AND created_at <= GREATEST(p_main_to, p_today_to, p_this_month_to)
    )
    GROUP BY order_id
  ),
  main_orders AS (
    SELECT o.id, o.status::text AS status, o.total_amount::numeric AS amt,
           o.preorder, COALESCE(oi.qty, 0) AS qty
    FROM public.orders o LEFT JOIN oi ON oi.order_id = o.id
    WHERE o.created_at >= p_main_from AND o.created_at <= p_main_to
  ),
  by_status AS (
    SELECT status, COUNT(*)::int AS cnt,
           COALESCE(SUM(qty),0)::numeric AS qty,
           COALESCE(SUM(amt),0)::numeric AS value
    FROM main_orders GROUP BY status
  ),
  all_bucket AS (
    SELECT COUNT(*)::int AS count,
           COALESCE(SUM(qty),0)::numeric AS qty,
           COALESCE(SUM(amt),0)::numeric AS value
    FROM main_orders WHERE status <> 'pending_web'
  ),
  preorder_bucket AS (
    SELECT COUNT(*)::int AS count,
           COALESCE(SUM(qty),0)::numeric AS qty,
           COALESCE(SUM(amt),0)::numeric AS value
    FROM main_orders WHERE preorder = true
  ),
  today_sent AS (
    SELECT COUNT(*)::int AS count,
           COALESCE(SUM(COALESCE(oi.qty,0)),0)::numeric AS qty,
           COALESCE(SUM(o.total_amount::numeric),0)::numeric AS value
    FROM public.orders o LEFT JOIN oi ON oi.order_id = o.id
    WHERE o.created_at >= p_today_from AND o.created_at <= p_today_to
      AND o.status::text IN ('shipped','completed')
  ),
  tm AS (
    SELECT o.status::text AS status, o.total_amount::numeric AS amt,
           o.customer_phone, COALESCE(oi.qty,0) AS qty
    FROM public.orders o LEFT JOIN oi ON oi.order_id = o.id
    WHERE o.created_at >= p_this_month_from AND o.created_at <= p_this_month_to
      AND o.status::text <> 'pending_web'
  ),
  tm_agg AS (
    SELECT
      COUNT(*)::int AS orders,
      COALESCE(SUM(qty),0)::numeric AS quantity,
      COALESCE(SUM(amt) FILTER (WHERE status='completed'),0)::numeric AS sales,
      COUNT(*) FILTER (WHERE status='returned')::int AS returns,
      COUNT(DISTINCT customer_phone) FILTER (WHERE customer_phone IS NOT NULL)::int AS customers
    FROM tm
  )
  SELECT jsonb_build_object(
    'byStatus', COALESCE((
      SELECT jsonb_object_agg(status, jsonb_build_object('count', cnt, 'qty', qty, 'value', value))
      FROM by_status
    ), '{}'::jsonb),
    'all', (SELECT to_jsonb(all_bucket) FROM all_bucket),
    'preorder', (SELECT to_jsonb(preorder_bucket) FROM preorder_bucket),
    'todaySent', (SELECT to_jsonb(today_sent) FROM today_sent),
    'thisMonth', (SELECT to_jsonb(tm_agg) FROM tm_agg)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;