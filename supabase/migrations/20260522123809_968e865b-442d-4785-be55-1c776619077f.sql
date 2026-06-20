CREATE OR REPLACE FUNCTION public.get_order_tab_counts(
  p_source uuid DEFAULT NULL,
  p_courier uuid DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_phones text[] DEFAULT NULL,
  p_advance_only boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_search_n int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '28000';
  END IF;

  BEGIN
    v_search_n := NULLIF(btrim(COALESCE(p_search,'')), '')::int;
  EXCEPTION WHEN others THEN
    v_search_n := NULL;
  END;

  WITH base AS (
    SELECT o.id, o.status::text AS status, o.source, o.preorder,
           o.total_amount::numeric AS amt
    FROM public.orders o
    WHERE (p_source  IS NULL OR o.order_source_id = p_source)
      AND (p_courier IS NULL OR o.courier_id      = p_courier)
      AND (p_from    IS NULL OR o.created_at >= p_from)
      AND (p_to      IS NULL OR o.created_at <= p_to)
      AND (p_phones  IS NULL OR o.customer_phone = ANY(p_phones))
      AND (p_advance_only IS NULL OR o.advance_amount > 0)
      AND (
        COALESCE(NULLIF(btrim(p_search),''), '') = ''
        OR o.customer_name  ILIKE '%'||p_search||'%'
        OR o.customer_phone ILIKE '%'||p_search||'%'
        OR (v_search_n IS NOT NULL AND o.order_number = v_search_n)
      )
  ),
  per_status AS (
    SELECT status, COUNT(*)::int AS cnt, COALESCE(SUM(amt),0)::numeric AS amount
    FROM base GROUP BY status
  ),
  totals AS (
    SELECT
      jsonb_object_agg(status, jsonb_build_object('count', cnt, 'amount', amount)) AS by_status,
      (SELECT COUNT(*)::int FROM base) AS all_cnt,
      (SELECT COALESCE(SUM(amt),0)::numeric FROM base) AS all_amt,
      (SELECT COUNT(*)::int FROM base WHERE source = 'woocommerce' OR status = 'pending_web') AS web_cnt,
      (SELECT COALESCE(SUM(amt),0)::numeric FROM base WHERE source = 'woocommerce' OR status = 'pending_web') AS web_amt,
      (SELECT COUNT(*)::int FROM base WHERE source = 'facebook') AS fb_cnt,
      (SELECT COALESCE(SUM(amt),0)::numeric FROM base WHERE source = 'facebook') AS fb_amt,
      (SELECT COUNT(*)::int FROM base WHERE preorder = true) AS pre_cnt,
      (SELECT COALESCE(SUM(amt),0)::numeric FROM base WHERE preorder = true) AS pre_amt
    FROM per_status
  )
  SELECT jsonb_build_object(
    'byStatus', COALESCE((SELECT by_status FROM totals), '{}'::jsonb),
    'all',      jsonb_build_object('count', (SELECT all_cnt FROM totals), 'amount', (SELECT all_amt FROM totals)),
    'web',      jsonb_build_object('count', (SELECT web_cnt FROM totals), 'amount', (SELECT web_amt FROM totals)),
    'facebook', jsonb_build_object('count', (SELECT fb_cnt FROM totals), 'amount', (SELECT fb_amt FROM totals)),
    'preorder', jsonb_build_object('count', (SELECT pre_cnt FROM totals), 'amount', (SELECT pre_amt FROM totals))
  ) INTO v_result;

  RETURN v_result;
END;
$function$;