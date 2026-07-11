
CREATE OR REPLACE FUNCTION public.get_order_tab_counts_v2(
  p_source uuid DEFAULT NULL,
  p_site uuid DEFAULT NULL,
  p_courier uuid DEFAULT NULL,
  p_partner text DEFAULT NULL,
  p_staff uuid DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_phones text[] DEFAULT NULL,
  p_advance_only boolean DEFAULT NULL,
  p_oms_restricted boolean DEFAULT false,
  p_allowed_oms text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_search text := btrim(COALESCE(p_search, ''));
  v_search_digits text := regexp_replace(COALESCE(p_search, ''), '[^0-9]', '', 'g');
  v_search_n int;
  v_norm_phone text;
  v_tail text;
  v_no_filters boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '28000';
  END IF;

  -- Fast path: no filters at all → read from prebuilt cache
  v_no_filters := (
    p_source IS NULL AND p_site IS NULL AND p_courier IS NULL
    AND p_partner IS NULL AND p_staff IS NULL
    AND p_from IS NULL AND p_to IS NULL
    AND (p_search IS NULL OR btrim(p_search) = '')
    AND p_phones IS NULL
    AND p_advance_only IS NULL
    AND p_oms_restricted = false
  );

  IF v_no_filters THEN
    SELECT jsonb_build_object(
      'byStatus', COALESCE(
        (SELECT jsonb_object_agg(bucket_key, jsonb_build_object('count', order_count, 'amount', total_amount))
         FROM public.order_status_counts WHERE bucket_type = 'status'),
        '{}'::jsonb
      ),
      'all',      COALESCE((SELECT jsonb_build_object('count', order_count, 'amount', total_amount) FROM public.order_status_counts WHERE bucket_type='all'      AND bucket_key='all'),      jsonb_build_object('count',0,'amount',0)),
      'web',      COALESCE((SELECT jsonb_build_object('count', order_count, 'amount', total_amount) FROM public.order_status_counts WHERE bucket_type='source'   AND bucket_key='woocommerce'), jsonb_build_object('count',0,'amount',0)),
      'facebook', COALESCE((SELECT jsonb_build_object('count', order_count, 'amount', total_amount) FROM public.order_status_counts WHERE bucket_type='source'   AND bucket_key='facebook'), jsonb_build_object('count',0,'amount',0)),
      'partner',  COALESCE((SELECT jsonb_build_object('count', order_count, 'amount', total_amount) FROM public.order_status_counts WHERE bucket_type='source'   AND bucket_key='oms'),      jsonb_build_object('count',0,'amount',0)),
      'preorder', COALESCE((SELECT jsonb_build_object('count', order_count, 'amount', total_amount) FROM public.order_status_counts WHERE bucket_type='preorder' AND bucket_key='preorder'), jsonb_build_object('count',0,'amount',0))
    ) INTO v_result;

    -- If cache returned nothing meaningful (empty table), fall through to live
    IF v_result IS NOT NULL AND (v_result->'all'->>'count')::int > 0 THEN
      RETURN v_result;
    END IF;
  END IF;

  -- Live aggregate path (unchanged)
  BEGIN
    v_search_n := NULLIF(v_search_digits, '')::int;
  EXCEPTION WHEN others THEN
    v_search_n := NULL;
  END;

  IF length(v_search_digits) >= 10 THEN
    v_norm_phone := right(v_search_digits, 11);
    v_tail := right(v_search_digits, 8);
  ELSIF length(v_search_digits) >= 3 THEN
    v_tail := CASE WHEN length(v_search_digits) >= 8 THEN right(v_search_digits, 8) ELSE v_search_digits END;
  END IF;

  IF v_search = '' THEN
    WITH base AS (
      SELECT o.id, o.status::text AS status, o.source, o.preorder, o.total_amount::numeric AS amt
      FROM public.orders o
      WHERE (p_source IS NULL OR o.order_source_id = p_source)
        AND (p_site IS NULL OR o.source_site_id = p_site)
        AND (p_courier IS NULL OR o.courier_id = p_courier)
        AND (p_partner IS NULL OR o.oms_sender_name = p_partner)
        AND (p_staff IS NULL OR o.created_by = p_staff)
        AND (p_from IS NULL OR o.created_at >= p_from)
        AND (p_to IS NULL OR o.created_at <= p_to)
        AND (p_advance_only IS NULL OR o.advance_amount > 0)
        AND (
          NOT p_oms_restricted
          OR o.source <> 'oms'
          OR (p_allowed_oms IS NOT NULL AND o.oms_sender_name = ANY(p_allowed_oms))
        )
        AND (
          p_phones IS NULL
          OR EXISTS (
            SELECT 1
            FROM unnest(p_phones) AS k(raw_key)
            CROSS JOIN LATERAL (SELECT regexp_replace(raw_key, '[^0-9]', '', 'g') AS key) cleaned
            WHERE cleaned.key <> ''
              AND (
                (length(cleaned.key) <= 8 AND (o.customer_phone ILIKE '%' || cleaned.key || '%' OR o.phone_normalized ILIKE '%' || cleaned.key || '%'))
                OR (length(cleaned.key) > 8 AND o.phone_normalized = cleaned.key)
              )
          )
        )
    ),
    per_status AS (
      SELECT status, COUNT(*)::int AS cnt, COALESCE(SUM(amt), 0)::numeric AS amount
      FROM base GROUP BY status
    ),
    totals AS (
      SELECT
        jsonb_object_agg(status, jsonb_build_object('count', cnt, 'amount', amount)) AS by_status,
        (SELECT COUNT(*)::int FROM base) AS all_cnt,
        (SELECT COALESCE(SUM(amt), 0)::numeric FROM base) AS all_amt,
        (SELECT COUNT(*)::int FROM base WHERE source = 'woocommerce') AS web_cnt,
        (SELECT COALESCE(SUM(amt), 0)::numeric FROM base WHERE source = 'woocommerce') AS web_amt,
        (SELECT COUNT(*)::int FROM base WHERE source = 'facebook') AS fb_cnt,
        (SELECT COALESCE(SUM(amt), 0)::numeric FROM base WHERE source = 'facebook') AS fb_amt,
        (SELECT COUNT(*)::int FROM base WHERE source = 'oms') AS partner_cnt,
        (SELECT COALESCE(SUM(amt), 0)::numeric FROM base WHERE source = 'oms') AS partner_amt,
        (SELECT COUNT(*)::int FROM base WHERE preorder = true) AS pre_cnt,
        (SELECT COALESCE(SUM(amt), 0)::numeric FROM base WHERE preorder = true) AS pre_amt
      FROM per_status
    )
    SELECT jsonb_build_object(
      'byStatus', COALESCE((SELECT by_status FROM totals), '{}'::jsonb),
      'all',      jsonb_build_object('count', COALESCE((SELECT all_cnt FROM totals), 0),     'amount', COALESCE((SELECT all_amt FROM totals), 0)),
      'web',      jsonb_build_object('count', COALESCE((SELECT web_cnt FROM totals), 0),     'amount', COALESCE((SELECT web_amt FROM totals), 0)),
      'facebook', jsonb_build_object('count', COALESCE((SELECT fb_cnt FROM totals), 0),      'amount', COALESCE((SELECT fb_amt FROM totals), 0)),
      'partner',  jsonb_build_object('count', COALESCE((SELECT partner_cnt FROM totals), 0), 'amount', COALESCE((SELECT partner_amt FROM totals), 0)),
      'preorder', jsonb_build_object('count', COALESCE((SELECT pre_cnt FROM totals), 0),     'amount', COALESCE((SELECT pre_amt FROM totals), 0))
    ) INTO v_result;
  ELSE
    WITH base AS (
      SELECT o.id, o.status::text AS status, o.source, o.preorder, o.total_amount::numeric AS amt
      FROM public.orders o
      WHERE (p_source IS NULL OR o.order_source_id = p_source)
        AND (p_site IS NULL OR o.source_site_id = p_site)
        AND (p_courier IS NULL OR o.courier_id = p_courier)
        AND (p_partner IS NULL OR o.oms_sender_name = p_partner)
        AND (p_staff IS NULL OR o.created_by = p_staff)
        AND (p_from IS NULL OR o.created_at >= p_from)
        AND (p_to IS NULL OR o.created_at <= p_to)
        AND (p_advance_only IS NULL OR o.advance_amount > 0)
        AND (
          NOT p_oms_restricted
          OR o.source <> 'oms'
          OR (p_allowed_oms IS NOT NULL AND o.oms_sender_name = ANY(p_allowed_oms))
        )
        AND (
          p_phones IS NULL
          OR EXISTS (
            SELECT 1
            FROM unnest(p_phones) AS k(raw_key)
            CROSS JOIN LATERAL (SELECT regexp_replace(raw_key, '[^0-9]', '', 'g') AS key) cleaned
            WHERE cleaned.key <> ''
              AND (
                (length(cleaned.key) <= 8 AND (o.customer_phone ILIKE '%' || cleaned.key || '%' OR o.phone_normalized ILIKE '%' || cleaned.key || '%'))
                OR (length(cleaned.key) > 8 AND o.phone_normalized = cleaned.key)
              )
          )
        )
        AND (
          o.customer_name ILIKE '%' || v_search || '%'
          OR (v_norm_phone IS NOT NULL AND o.phone_normalized = v_norm_phone)
          OR (v_tail IS NOT NULL AND (o.phone_normalized ILIKE '%' || v_tail || '%' OR o.customer_phone ILIKE '%' || v_tail || '%'))
          OR (v_search_n IS NOT NULL AND o.order_number = v_search_n)
        )
    ),
    per_status AS (
      SELECT status, COUNT(*)::int AS cnt, COALESCE(SUM(amt), 0)::numeric AS amount
      FROM base GROUP BY status
    ),
    totals AS (
      SELECT
        jsonb_object_agg(status, jsonb_build_object('count', cnt, 'amount', amount)) AS by_status,
        (SELECT COUNT(*)::int FROM base) AS all_cnt,
        (SELECT COALESCE(SUM(amt), 0)::numeric FROM base) AS all_amt,
        (SELECT COUNT(*)::int FROM base WHERE source = 'woocommerce') AS web_cnt,
        (SELECT COALESCE(SUM(amt), 0)::numeric FROM base WHERE source = 'woocommerce') AS web_amt,
        (SELECT COUNT(*)::int FROM base WHERE source = 'facebook') AS fb_cnt,
        (SELECT COALESCE(SUM(amt), 0)::numeric FROM base WHERE source = 'facebook') AS fb_amt,
        (SELECT COUNT(*)::int FROM base WHERE source = 'oms') AS partner_cnt,
        (SELECT COALESCE(SUM(amt), 0)::numeric FROM base WHERE source = 'oms') AS partner_amt,
        (SELECT COUNT(*)::int FROM base WHERE preorder = true) AS pre_cnt,
        (SELECT COALESCE(SUM(amt), 0)::numeric FROM base WHERE preorder = true) AS pre_amt
      FROM per_status
    )
    SELECT jsonb_build_object(
      'byStatus', COALESCE((SELECT by_status FROM totals), '{}'::jsonb),
      'all',      jsonb_build_object('count', COALESCE((SELECT all_cnt FROM totals), 0),     'amount', COALESCE((SELECT all_amt FROM totals), 0)),
      'web',      jsonb_build_object('count', COALESCE((SELECT web_cnt FROM totals), 0),     'amount', COALESCE((SELECT web_amt FROM totals), 0)),
      'facebook', jsonb_build_object('count', COALESCE((SELECT fb_cnt FROM totals), 0),      'amount', COALESCE((SELECT fb_amt FROM totals), 0)),
      'partner',  jsonb_build_object('count', COALESCE((SELECT partner_cnt FROM totals), 0), 'amount', COALESCE((SELECT partner_amt FROM totals), 0)),
      'preorder', jsonb_build_object('count', COALESCE((SELECT pre_cnt FROM totals), 0),     'amount', COALESCE((SELECT pre_amt FROM totals), 0))
    ) INTO v_result;
  END IF;

  RETURN v_result;
END;
$function$;
