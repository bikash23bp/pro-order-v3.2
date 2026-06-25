CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS idx_orders_customer_name_trgm
  ON public.orders USING gin (customer_name extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_orders_customer_phone_trgm
  ON public.orders USING gin (customer_phone extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_orders_phone_normalized_trgm
  ON public.orders USING gin (phone_normalized extensions.gin_trgm_ops);

ALTER ROLE authenticated SET statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.get_order_tab_counts_v2(
  p_source uuid DEFAULT NULL::uuid,
  p_site uuid DEFAULT NULL::uuid,
  p_courier uuid DEFAULT NULL::uuid,
  p_partner text DEFAULT NULL::text,
  p_staff uuid DEFAULT NULL::uuid,
  p_from timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_to timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_search text DEFAULT NULL::text,
  p_phones text[] DEFAULT NULL::text[],
  p_advance_only boolean DEFAULT NULL::boolean,
  p_oms_restricted boolean DEFAULT false,
  p_allowed_oms text[] DEFAULT NULL::text[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_search text := btrim(COALESCE(p_search, ''));
  v_search_digits text := regexp_replace(COALESCE(p_search, ''), '[^0-9]', '', 'g');
  v_search_n int;
  v_norm_phone text;
  v_tail text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '28000';
  END IF;

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
      FROM base
      GROUP BY status
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
      'all', jsonb_build_object('count', COALESCE((SELECT all_cnt FROM totals), 0), 'amount', COALESCE((SELECT all_amt FROM totals), 0)),
      'web', jsonb_build_object('count', COALESCE((SELECT web_cnt FROM totals), 0), 'amount', COALESCE((SELECT web_amt FROM totals), 0)),
      'facebook', jsonb_build_object('count', COALESCE((SELECT fb_cnt FROM totals), 0), 'amount', COALESCE((SELECT fb_amt FROM totals), 0)),
      'partner', jsonb_build_object('count', COALESCE((SELECT partner_cnt FROM totals), 0), 'amount', COALESCE((SELECT partner_amt FROM totals), 0)),
      'preorder', jsonb_build_object('count', COALESCE((SELECT pre_cnt FROM totals), 0), 'amount', COALESCE((SELECT pre_amt FROM totals), 0))
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
      FROM base
      GROUP BY status
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
      'all', jsonb_build_object('count', COALESCE((SELECT all_cnt FROM totals), 0), 'amount', COALESCE((SELECT all_amt FROM totals), 0)),
      'web', jsonb_build_object('count', COALESCE((SELECT web_cnt FROM totals), 0), 'amount', COALESCE((SELECT web_amt FROM totals), 0)),
      'facebook', jsonb_build_object('count', COALESCE((SELECT fb_cnt FROM totals), 0), 'amount', COALESCE((SELECT fb_amt FROM totals), 0)),
      'partner', jsonb_build_object('count', COALESCE((SELECT partner_cnt FROM totals), 0), 'amount', COALESCE((SELECT partner_amt FROM totals), 0)),
      'preorder', jsonb_build_object('count', COALESCE((SELECT pre_cnt FROM totals), 0), 'amount', COALESCE((SELECT pre_amt FROM totals), 0))
    ) INTO v_result;
  END IF;

  RETURN v_result;
END;
$function$;

ANALYZE public.orders;