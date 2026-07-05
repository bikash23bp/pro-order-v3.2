CREATE OR REPLACE FUNCTION public.apply_order_status_count_delta(p_order public.orders, p_delta integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount numeric := COALESCE(p_order.total_amount, 0) * p_delta;
BEGIN
  IF p_order.id IS NULL THEN
    RETURN;
  END IF;

  PERFORM public.bump_order_status_count('all', 'all', p_delta, v_amount);

  IF p_order.status IS NOT NULL THEN
    PERFORM public.bump_order_status_count('status', p_order.status::text, p_delta, v_amount);
  END IF;

  IF p_order.source IS NOT NULL AND p_order.source <> '' THEN
    PERFORM public.bump_order_status_count('source', p_order.source, p_delta, v_amount);
  END IF;

  IF COALESCE(p_order.preorder, false) THEN
    PERFORM public.bump_order_status_count('preorder', 'true', p_delta, v_amount);
  END IF;

  IF p_order.forwarded_to_partner_at IS NOT NULL THEN
    PERFORM public.bump_order_status_count('sent_to_partner', 'true', p_delta, v_amount);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_order_status_counts()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  TRUNCATE public.order_status_counts;

  INSERT INTO public.order_status_counts (bucket_type, bucket_key, order_count, total_amount, updated_at)
  SELECT 'all', 'all', COUNT(*)::int, COALESCE(SUM(total_amount), 0)::numeric(14,2), now()
  FROM public.orders;

  INSERT INTO public.order_status_counts (bucket_type, bucket_key, order_count, total_amount, updated_at)
  SELECT 'status', status::text, COUNT(*)::int, COALESCE(SUM(total_amount), 0)::numeric(14,2), now()
  FROM public.orders
  GROUP BY status;

  INSERT INTO public.order_status_counts (bucket_type, bucket_key, order_count, total_amount, updated_at)
  SELECT 'source', source, COUNT(*)::int, COALESCE(SUM(total_amount), 0)::numeric(14,2), now()
  FROM public.orders
  WHERE source IS NOT NULL AND source <> ''
  GROUP BY source;

  INSERT INTO public.order_status_counts (bucket_type, bucket_key, order_count, total_amount, updated_at)
  SELECT 'preorder', 'true', COUNT(*)::int, COALESCE(SUM(total_amount), 0)::numeric(14,2), now()
  FROM public.orders
  WHERE preorder = true;

  INSERT INTO public.order_status_counts (bucket_type, bucket_key, order_count, total_amount, updated_at)
  SELECT 'sent_to_partner', 'true', COUNT(*)::int, COALESCE(SUM(total_amount), 0)::numeric(14,2), now()
  FROM public.orders
  WHERE forwarded_to_partner_at IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.trg_order_status_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.apply_order_status_count_delta(NEW, 1);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.apply_order_status_count_delta(OLD, -1);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF COALESCE(OLD.status::text, '') IS DISTINCT FROM COALESCE(NEW.status::text, '')
       OR COALESCE(OLD.source, '') IS DISTINCT FROM COALESCE(NEW.source, '')
       OR COALESCE(OLD.preorder, false) IS DISTINCT FROM COALESCE(NEW.preorder, false)
       OR COALESCE(OLD.forwarded_to_partner_at, '-infinity'::timestamptz) IS DISTINCT FROM COALESCE(NEW.forwarded_to_partner_at, '-infinity'::timestamptz)
       OR COALESCE(OLD.total_amount, 0) IS DISTINCT FROM COALESCE(NEW.total_amount, 0) THEN
      PERFORM public.apply_order_status_count_delta(OLD, -1);
      PERFORM public.apply_order_status_count_delta(NEW, 1);
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

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
    'all', COALESCE((SELECT jsonb_build_object('count', order_count, 'amount', total_amount) FROM rows WHERE bucket_type = 'all' AND bucket_key = 'all'), jsonb_build_object('count', 0, 'amount', 0)),
    'web', COALESCE((SELECT jsonb_build_object('count', order_count, 'amount', total_amount) FROM rows WHERE bucket_type = 'source' AND bucket_key = 'woocommerce'), jsonb_build_object('count', 0, 'amount', 0)),
    'facebook', COALESCE((SELECT jsonb_build_object('count', order_count, 'amount', total_amount) FROM rows WHERE bucket_type = 'source' AND bucket_key = 'facebook'), jsonb_build_object('count', 0, 'amount', 0)),
    'partner', COALESCE((SELECT jsonb_build_object('count', order_count, 'amount', total_amount) FROM rows WHERE bucket_type = 'source' AND bucket_key = 'oms'), jsonb_build_object('count', 0, 'amount', 0)),
    'preorder', COALESCE((SELECT jsonb_build_object('count', order_count, 'amount', total_amount) FROM rows WHERE bucket_type = 'preorder' AND bucket_key = 'true'), jsonb_build_object('count', 0, 'amount', 0)),
    'sent_to_partner', COALESCE((SELECT jsonb_build_object('count', order_count, 'amount', total_amount) FROM rows WHERE bucket_type = 'sent_to_partner' AND bucket_key = 'true'), jsonb_build_object('count', 0, 'amount', 0))
  );
$$;

REVOKE ALL ON FUNCTION public.apply_order_status_count_delta(public.orders, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_order_status_counts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_order_status_counts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_order_counts_summary_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_order_status_count_delta(public.orders, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_order_status_counts() TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_order_status_counts() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_order_counts_summary_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_counts_summary_v1() TO service_role;

SELECT public.refresh_order_status_counts();