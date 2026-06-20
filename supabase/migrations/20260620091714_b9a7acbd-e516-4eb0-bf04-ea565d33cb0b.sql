CREATE INDEX IF NOT EXISTS idx_orders_status_created_at_desc ON public.orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_order_source_created_at_desc ON public.orders (order_source_id, created_at DESC) WHERE order_source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_partner_created_at_desc ON public.orders (oms_sender_name, created_at DESC) WHERE oms_sender_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_advance_created_at_desc ON public.orders (created_at DESC) WHERE advance_amount > 0;
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON public.orders (order_number);
CREATE INDEX IF NOT EXISTS idx_orders_email_lower ON public.orders (lower(btrim(customer_email))) WHERE customer_email IS NOT NULL AND btrim(customer_email) <> '';
CREATE INDEX IF NOT EXISTS idx_imported_customers_phone_trim ON public.imported_customers (btrim(phone));

CREATE OR REPLACE FUNCTION public.get_order_customer_flags_v1(
  p_phones text[] DEFAULT NULL::text[],
  p_emails text[] DEFAULT NULL::text[]
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH input_phones AS (
    SELECT DISTINCT NULLIF(regexp_replace(phone, '[^0-9]', '', 'g'), '') AS phone
    FROM unnest(COALESCE(p_phones, ARRAY[]::text[])) AS phone
  ),
  input_emails AS (
    SELECT DISTINCT lower(btrim(email)) AS email
    FROM unnest(COALESCE(p_emails, ARRAY[]::text[])) AS email
    WHERE btrim(email) <> ''
  ),
  settings AS (
    SELECT
      COALESCE(vip_spend_threshold, 10000)::numeric AS vip_spend,
      COALESCE(vip_order_threshold, 5)::int AS vip_orders
    FROM public.app_settings
    WHERE id = true
  ),
  phone_stats AS (
    SELECT
      o.phone_normalized AS phone,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE o.status = 'completed')::int AS completed,
      COALESCE(SUM(o.total_amount) FILTER (WHERE o.status <> ALL (ARRAY['cancelled'::public.order_status, 'returned'::public.order_status])), 0)::numeric AS spent,
      COUNT(*) FILTER (WHERE o.status = 'returned')::int AS returned,
      COUNT(*) FILTER (WHERE o.status = ANY (ARRAY['pending_web'::public.order_status, 'pending'::public.order_status, 'ready_order'::public.order_status, 'processing'::public.order_status, 'ready_to_ship'::public.order_status, 'out_of_stock'::public.order_status, 'shipped'::public.order_status, 'no_response'::public.order_status, 'hold'::public.order_status, 'fraud'::public.order_status, 'incomplete'::public.order_status]))::int AS active
    FROM public.orders o
    JOIN input_phones ip ON ip.phone = o.phone_normalized
    GROUP BY o.phone_normalized
  ),
  imported AS (
    SELECT regexp_replace(btrim(ic.phone), '[^0-9]', '', 'g') AS phone
    FROM public.imported_customers ic
    JOIN input_phones ip ON ip.phone = regexp_replace(btrim(ic.phone), '[^0-9]', '', 'g')
    GROUP BY 1
  ),
  members AS (
    SELECT regexp_replace(btrim(mc.phone), '[^0-9]', '', 'g') AS phone
    FROM public.membership_customers mc
    JOIN input_phones ip ON ip.phone = regexp_replace(btrim(mc.phone), '[^0-9]', '', 'g')
    GROUP BY 1
  ),
  email_stats AS (
    SELECT
      lower(btrim(o.customer_email)) AS email,
      COUNT(*) FILTER (WHERE o.status = ANY (ARRAY['pending_web'::public.order_status, 'pending'::public.order_status, 'ready_order'::public.order_status, 'processing'::public.order_status, 'ready_to_ship'::public.order_status, 'out_of_stock'::public.order_status, 'shipped'::public.order_status, 'no_response'::public.order_status, 'hold'::public.order_status, 'fraud'::public.order_status, 'incomplete'::public.order_status]))::int AS active
    FROM public.orders o
    JOIN input_emails ie ON ie.email = lower(btrim(o.customer_email))
    GROUP BY lower(btrim(o.customer_email))
  )
  SELECT jsonb_build_object(
    'phones', COALESCE((
      SELECT jsonb_object_agg(ip.phone, jsonb_build_object(
        'total', COALESCE(ps.total, 0),
        'completed', COALESCE(ps.completed, 0),
        'spent', COALESCE(ps.spent, 0),
        'returned', COALESCE(ps.returned, 0),
        'active', COALESCE(ps.active, 0),
        'imported', i.phone IS NOT NULL,
        'member', m.phone IS NOT NULL,
        'vip', COALESCE(ps.completed, 0) >= (SELECT vip_orders FROM settings) OR COALESCE(ps.spent, 0) >= (SELECT vip_spend FROM settings)
      ))
      FROM input_phones ip
      LEFT JOIN phone_stats ps ON ps.phone = ip.phone
      LEFT JOIN imported i ON i.phone = ip.phone
      LEFT JOIN members m ON m.phone = ip.phone
      WHERE ip.phone IS NOT NULL
    ), '{}'::jsonb),
    'emails', COALESCE((
      SELECT jsonb_object_agg(ie.email, jsonb_build_object('active', COALESCE(es.active, 0)))
      FROM input_emails ie
      LEFT JOIN email_stats es ON es.email = ie.email
    ), '{}'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_order_customer_flags_v1(text[], text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_customer_flags_v1(text[], text[]) TO service_role;

ANALYZE public.orders;
ANALYZE public.order_items;
ANALYZE public.imported_customers;
ANALYZE public.membership_customers;
ANALYZE public.profiles;
ANALYZE public.integrations;