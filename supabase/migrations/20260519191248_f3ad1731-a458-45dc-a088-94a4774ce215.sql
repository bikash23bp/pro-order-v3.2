-- Indexes to speed up dashboard aggregates as order volume grows
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders (created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status_created_at ON public.orders (status, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_source_status ON public.orders (source, status);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items (order_id);

-- Single aggregate function returning all dashboard data as one JSON blob.
CREATE OR REPLACE FUNCTION public.get_dashboard_bundle(
  p_main_from timestamptz,
  p_main_to timestamptz,
  p_summary_from timestamptz,
  p_summary_to timestamptz,
  p_today_from timestamptz,
  p_today_to timestamptz,
  p_yesterday_from timestamptz,
  p_yesterday_to timestamptz,
  p_week_from timestamptz,
  p_week_to timestamptz,
  p_this_month_from timestamptz,
  p_this_month_to timestamptz,
  p_last_month_from timestamptz,
  p_last_month_to timestamptz,
  p_repeat_from timestamptz DEFAULT NULL,
  p_repeat_to timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
  v_today_key date := (now() at time zone 'UTC')::date;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '28000';
  END IF;

  WITH
  -- Pre-aggregate item quantities per order, once.
  oi AS (
    SELECT order_id, SUM(quantity)::numeric AS qty
    FROM public.order_items
    GROUP BY order_id
  ),

  -- ===== Main range =====
  main_orders AS (
    SELECT o.id, o.status::text AS status, o.total_amount::numeric AS amt,
           o.created_at, o.preorder, COALESCE(oi.qty, 0) AS qty
    FROM public.orders o LEFT JOIN oi ON oi.order_id = o.id
    WHERE o.created_at >= p_main_from AND o.created_at <= p_main_to
  ),
  by_status AS (
    SELECT status,
           COUNT(*)::int AS cnt,
           COALESCE(SUM(qty),0)::numeric AS qty,
           COALESCE(SUM(amt),0)::numeric AS value
    FROM main_orders GROUP BY status
  ),
  all_bucket AS (
    SELECT COUNT(*)::int AS cnt,
           COALESCE(SUM(qty),0)::numeric AS qty,
           COALESCE(SUM(amt),0)::numeric AS value
    FROM main_orders WHERE status <> 'pending_web'
  ),
  preorder_bucket AS (
    SELECT COUNT(*)::int AS cnt,
           COALESCE(SUM(qty),0)::numeric AS qty,
           COALESCE(SUM(amt),0)::numeric AS value
    FROM main_orders WHERE preorder = true
  ),
  trend_data AS (
    SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS d,
           COALESCE(SUM(amt),0)::numeric AS total
    FROM main_orders
    WHERE status = 'completed'
    GROUP BY date_trunc('day', created_at)
    ORDER BY date_trunc('day', created_at)
    LIMIT 31
  ),
  today_rev AS (
    SELECT COALESCE(SUM(amt),0)::numeric AS v
    FROM main_orders
    WHERE status = 'completed'
      AND (created_at at time zone 'UTC')::date = v_today_key
  ),

  -- ===== Order update summary range =====
  summary_orders AS (
    SELECT o.status::text AS status, o.total_amount::numeric AS amt,
           o.courier_id, COALESCE(oi.qty, 0) AS qty
    FROM public.orders o LEFT JOIN oi ON oi.order_id = o.id
    WHERE o.created_at >= p_summary_from AND o.created_at <= p_summary_to
      AND o.status::text <> 'pending_web'
  ),
  created_bucket AS (
    SELECT COUNT(*)::int AS cnt,
           COALESCE(SUM(qty),0)::numeric AS qty,
           COALESCE(SUM(amt),0)::numeric AS value
    FROM summary_orders
  ),
  sent_bucket AS (
    SELECT COUNT(*)::int AS cnt,
           COALESCE(SUM(qty),0)::numeric AS qty,
           COALESCE(SUM(amt),0)::numeric AS value
    FROM summary_orders WHERE status IN ('shipped','completed')
  ),
  by_courier AS (
    SELECT s.courier_id,
           COALESCE(c.name, CASE WHEN s.courier_id IS NULL THEN 'No Courier' ELSE 'Unknown' END) AS courier_name,
           COUNT(*)::int AS cnt,
           COALESCE(SUM(s.qty),0)::numeric AS qty,
           COALESCE(SUM(s.amt),0)::numeric AS value
    FROM summary_orders s
    LEFT JOIN public.couriers c ON c.id = s.courier_id
    WHERE s.status IN ('shipped','completed')
    GROUP BY s.courier_id, c.name
    ORDER BY COUNT(*) DESC
  ),

  -- ===== Quick summary helper (re-uses same agg per range) =====
  quick_range AS (
    SELECT 'today' AS k, p_today_from AS f, p_today_to AS t
    UNION ALL SELECT 'yesterday', p_yesterday_from, p_yesterday_to
    UNION ALL SELECT 'week', p_week_from, p_week_to
  ),
  quick_data AS (
    SELECT qr.k,
           COUNT(*) FILTER (WHERE o.status::text IN ('shipped','completed'))::int AS sent_cnt,
           COALESCE(SUM(COALESCE(oi.qty,0)) FILTER (WHERE o.status::text IN ('shipped','completed')),0)::numeric AS sent_qty,
           COALESCE(SUM(o.total_amount::numeric) FILTER (WHERE o.status::text IN ('shipped','completed')),0)::numeric AS sent_value
    FROM quick_range qr
    LEFT JOIN public.orders o
      ON o.created_at >= qr.f AND o.created_at <= qr.t
     AND o.status::text <> 'pending_web'
    LEFT JOIN oi ON oi.order_id = o.id
    GROUP BY qr.k
  ),

  -- ===== Customer period (this/last month) =====
  cp_range AS (
    SELECT 'this'::text AS k, p_this_month_from AS f, p_this_month_to AS t
    UNION ALL SELECT 'last', p_last_month_from, p_last_month_to
  ),
  cp_data AS (
    SELECT cp.k,
           COUNT(o.id)::int AS orders_cnt,
           COALESCE(SUM(COALESCE(oi.qty,0)),0)::numeric AS qty,
           COALESCE(SUM(o.total_amount::numeric) FILTER (WHERE o.status::text='completed'),0)::numeric AS sales,
           COUNT(*) FILTER (WHERE o.status::text='returned')::int AS returns,
           COUNT(DISTINCT o.customer_phone) FILTER (WHERE o.customer_phone IS NOT NULL)::int AS customers
    FROM cp_range cp
    LEFT JOIN public.orders o
      ON o.created_at >= cp.f AND o.created_at <= cp.t
     AND o.status::text <> 'pending_web'
    LEFT JOIN oi ON oi.order_id = o.id
    GROUP BY cp.k
  ),

  -- ===== Repeat customer stats =====
  repeat_phones AS (
    SELECT customer_phone, COUNT(*) AS c
    FROM public.orders
    WHERE customer_phone IS NOT NULL
      AND (p_repeat_from IS NULL OR created_at >= p_repeat_from)
      AND (p_repeat_to IS NULL OR created_at <= p_repeat_to)
    GROUP BY customer_phone
  ),
  repeat_stats AS (
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE c >= 2)::int AS repeat_cnt
    FROM repeat_phones
  ),

  -- ===== Web / Incomplete / Facebook =====
  web_stats AS (
    SELECT COUNT(*)::int AS cnt, COALESCE(SUM(total_amount::numeric),0)::numeric AS total
    FROM public.orders
    WHERE source = 'woocommerce' AND status::text = 'pending_web'
  ),
  incomplete_stats AS (
    SELECT COUNT(*)::int AS cnt, COALESCE(SUM(total_amount::numeric),0)::numeric AS total
    FROM public.incomplete_orders
  ),
  fb_stats AS (
    SELECT COUNT(*)::int AS cnt,
           COALESCE(SUM(total_amount::numeric),0)::numeric AS total,
           COUNT(*) FILTER (WHERE status::text IN ('pending_web','processing'))::int AS pending
    FROM public.orders WHERE source = 'facebook'
  ),

  recent AS (
    SELECT id, order_number, customer_name, status::text AS status,
           total_amount, created_at
    FROM public.orders
    ORDER BY created_at DESC
    LIMIT 5
  ),
  business AS (
    SELECT business_name, business_address, business_phone, logo_url
    FROM public.app_settings WHERE id = true LIMIT 1
  )

  SELECT jsonb_build_object(
    'stats', jsonb_build_object(
      'byStatus', (
        SELECT jsonb_object_agg(status, jsonb_build_object('count', cnt, 'qty', qty, 'value', value))
        FROM by_status
      ),
      'all', (SELECT to_jsonb(all_bucket) FROM all_bucket),
      'preorder', (SELECT to_jsonb(preorder_bucket) FROM preorder_bucket),
      'trend', COALESCE((SELECT jsonb_agg(jsonb_build_object('date', d, 'total', round(total))) FROM trend_data), '[]'::jsonb),
      'todayRevenue', (SELECT v FROM today_rev)
    ),
    'summary', jsonb_build_object(
      'created', (SELECT to_jsonb(created_bucket) FROM created_bucket),
      'sentToCourier', (SELECT to_jsonb(sent_bucket) FROM sent_bucket),
      'byCourier', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'courier_id', courier_id, 'courier_name', courier_name,
          'count', cnt, 'qty', qty, 'value', value))
        FROM by_courier
      ), '[]'::jsonb)
    ),
    'quick', (
      SELECT jsonb_object_agg(k, jsonb_build_object(
        'sentToCourier', jsonb_build_object('count', sent_cnt, 'qty', sent_qty, 'value', sent_value)
      )) FROM quick_data
    ),
    'customerPeriod', (
      SELECT jsonb_object_agg(k, jsonb_build_object(
        'sales', round(sales), 'orders', orders_cnt,
        'quantity', qty, 'customers', customers, 'returns', returns
      )) FROM cp_data
    ),
    'repeat', (
      SELECT jsonb_build_object(
        'total', total, 'repeat', repeat_cnt,
        'percent', CASE WHEN total > 0 THEN (repeat_cnt::numeric / total) * 100 ELSE 0 END
      ) FROM repeat_stats
    ),
    'webOrders', (SELECT jsonb_build_object('count', cnt, 'total', total) FROM web_stats),
    'incomplete', (SELECT jsonb_build_object('count', cnt, 'total', total) FROM incomplete_stats),
    'facebook', (SELECT jsonb_build_object('count', cnt, 'total', total, 'pending', pending) FROM fb_stats),
    'recent', COALESCE((SELECT jsonb_agg(to_jsonb(recent)) FROM recent), '[]'::jsonb),
    'business', (SELECT to_jsonb(business) FROM business)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_bundle(
  timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,
  timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,
  timestamptz,timestamptz,timestamptz,timestamptz
) TO authenticated;