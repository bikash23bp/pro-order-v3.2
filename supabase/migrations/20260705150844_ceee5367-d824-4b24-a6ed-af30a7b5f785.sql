CREATE TABLE IF NOT EXISTS public.order_status_counts (
  bucket_type text NOT NULL,
  bucket_key text NOT NULL,
  order_count integer NOT NULL DEFAULT 0,
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket_type, bucket_key)
);

GRANT SELECT ON public.order_status_counts TO authenticated;
GRANT ALL ON public.order_status_counts TO service_role;

ALTER TABLE public.order_status_counts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view order status counts" ON public.order_status_counts;
CREATE POLICY "Authenticated users can view order status counts"
ON public.order_status_counts
FOR SELECT
TO authenticated
USING (true);

CREATE OR REPLACE FUNCTION public.bump_order_status_count(
  p_bucket_type text,
  p_bucket_key text,
  p_count_delta integer,
  p_amount_delta numeric
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.order_status_counts (bucket_type, bucket_key, order_count, total_amount, updated_at)
  VALUES (p_bucket_type, p_bucket_key, p_count_delta, p_amount_delta, now())
  ON CONFLICT (bucket_type, bucket_key)
  DO UPDATE SET
    order_count = GREATEST(0, public.order_status_counts.order_count + EXCLUDED.order_count),
    total_amount = GREATEST(0, public.order_status_counts.total_amount + EXCLUDED.total_amount),
    updated_at = now();
$$;

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
       OR COALESCE(OLD.total_amount, 0) IS DISTINCT FROM COALESCE(NEW.total_amount, 0) THEN
      PERFORM public.apply_order_status_count_delta(OLD, -1);
      PERFORM public.apply_order_status_count_delta(NEW, 1);
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_status_counts ON public.orders;
CREATE TRIGGER trg_order_status_counts
AFTER INSERT OR UPDATE OR DELETE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.trg_order_status_counts();

CREATE OR REPLACE FUNCTION public.get_order_counts_summary_v1()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
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
SECURITY DEFINER
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

GRANT EXECUTE ON FUNCTION public.get_order_counts_summary_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_counts_summary_v1() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_order_item_previews_v1(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_item_previews_v1(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_order_status_counts() TO service_role;
GRANT EXECUTE ON FUNCTION public.bump_order_status_count(text, text, integer, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_order_status_count_delta(public.orders, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_order_status_counts() TO service_role;

SELECT public.refresh_order_status_counts();