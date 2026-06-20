
-- ============================================
-- USER LIMITS (super-admin controlled)
-- Only 'admin' role bypasses limits.
-- business_owner & others are limited unless admin sets higher caps.
-- ============================================

-- 1) Table
CREATE TABLE IF NOT EXISTS public.user_limits (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  oms_orders_per_month     integer,  -- NULL = unlimited
  woo_orders_per_month     integer,
  messages_per_month       integer,
  max_users_can_create     integer,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_limits TO authenticated;
GRANT ALL ON public.user_limits TO service_role;

ALTER TABLE public.user_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read own or admin" ON public.user_limits;
CREATE POLICY "read own or admin" ON public.user_limits
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admin manages limits" ON public.user_limits;
CREATE POLICY "admin manages limits" ON public.user_limits
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_user_limits_updated ON public.user_limits;
CREATE TRIGGER trg_user_limits_updated
  BEFORE UPDATE ON public.user_limits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Current-month usage view
CREATE OR REPLACE VIEW public.user_usage_current_month AS
SELECT
  u.id AS user_id,
  COALESCE((
    SELECT count(*) FROM public.orders o
    WHERE o.created_by = u.id
      AND COALESCE(o.source,'manual') NOT IN ('woocommerce','woocommerce_incomplete')
      AND o.created_at >= date_trunc('month', now())
  ), 0) AS oms_orders_used,
  COALESCE((
    SELECT count(*) FROM public.orders o
    WHERE o.created_by = u.id
      AND o.source IN ('woocommerce','woocommerce_incomplete')
      AND o.created_at >= date_trunc('month', now())
  ), 0) AS woo_orders_used,
  COALESCE((
    SELECT count(*) FROM public.sms_logs s
    WHERE s.sent_by = u.id AND s.created_at >= date_trunc('month', now())
  ), 0)
  +
  COALESCE((
    SELECT count(*) FROM public.whatsapp_logs w
    WHERE w.sent_by = u.id AND w.created_at >= date_trunc('month', now())
  ), 0) AS messages_used,
  COALESCE((
    SELECT count(*) FROM public.pending_user_invites p
    WHERE p.created_by = u.id AND p.created_at >= date_trunc('month', now())
  ), 0) AS users_created
FROM auth.users u;

GRANT SELECT ON public.user_usage_current_month TO authenticated, service_role;

-- 3) Limit checker (only super admin bypasses)
CREATE OR REPLACE FUNCTION public.check_user_limit(_user_id uuid, _type text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  cap integer;
  used integer;
BEGIN
  -- Super admin only -> unlimited
  IF public.has_role(_user_id, 'admin') THEN
    RETURN true;
  END IF;

  SELECT CASE _type
    WHEN 'oms_order'   THEN oms_orders_per_month
    WHEN 'woo_order'   THEN woo_orders_per_month
    WHEN 'message'     THEN messages_per_month
    WHEN 'create_user' THEN max_users_can_create
  END
  INTO cap
  FROM public.user_limits WHERE user_id = _user_id;

  -- No row OR NULL cap = NOT allowed (super admin must explicitly grant)
  IF cap IS NULL THEN
    RETURN false;
  END IF;

  SELECT CASE _type
    WHEN 'oms_order'   THEN oms_orders_used
    WHEN 'woo_order'   THEN woo_orders_used
    WHEN 'message'     THEN messages_used
    WHEN 'create_user' THEN users_created
  END
  INTO used
  FROM public.user_usage_current_month WHERE user_id = _user_id;

  RETURN COALESCE(used, 0) < cap;
END $$;

GRANT EXECUTE ON FUNCTION public.check_user_limit(uuid, text) TO authenticated, service_role;

-- 4) Convenience view: limits + usage joined
CREATE OR REPLACE VIEW public.user_limits_with_usage AS
SELECT
  l.user_id,
  u.email,
  l.oms_orders_per_month, usage.oms_orders_used,
  l.woo_orders_per_month, usage.woo_orders_used,
  l.messages_per_month,   usage.messages_used,
  l.max_users_can_create, usage.users_created,
  l.notes, l.updated_at
FROM public.user_limits l
JOIN auth.users u ON u.id = l.user_id
LEFT JOIN public.user_usage_current_month usage ON usage.user_id = l.user_id;

GRANT SELECT ON public.user_limits_with_usage TO authenticated, service_role;
