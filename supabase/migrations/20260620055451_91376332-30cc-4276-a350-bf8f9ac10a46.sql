
-- Rebuild views without exposing auth.users
DROP VIEW IF EXISTS public.user_limits_with_usage;
DROP VIEW IF EXISTS public.user_usage_current_month;

CREATE VIEW public.user_usage_current_month
WITH (security_invoker = true)
AS
SELECT
  p.id AS user_id,
  COALESCE((SELECT count(*) FROM public.orders o
    WHERE o.created_by = p.id
      AND COALESCE(o.source,'manual') NOT IN ('woocommerce','woocommerce_incomplete')
      AND o.created_at >= date_trunc('month', now())),0) AS oms_orders_used,
  COALESCE((SELECT count(*) FROM public.orders o
    WHERE o.created_by = p.id
      AND o.source IN ('woocommerce','woocommerce_incomplete')
      AND o.created_at >= date_trunc('month', now())),0) AS woo_orders_used,
  COALESCE((SELECT count(*) FROM public.sms_logs s
    WHERE s.sent_by = p.id AND s.created_at >= date_trunc('month', now())),0)
  + COALESCE((SELECT count(*) FROM public.whatsapp_logs w
    WHERE w.sent_by = p.id AND w.created_at >= date_trunc('month', now())),0) AS messages_used,
  COALESCE((SELECT count(*) FROM public.pending_user_invites pi
    WHERE pi.created_by = p.id AND pi.created_at >= date_trunc('month', now())),0) AS users_created
FROM public.profiles p;

GRANT SELECT ON public.user_usage_current_month TO authenticated, service_role;

CREATE VIEW public.user_limits_with_usage
WITH (security_invoker = true)
AS
SELECT
  l.user_id,
  p.email,
  l.oms_orders_per_month, u.oms_orders_used,
  l.woo_orders_per_month, u.woo_orders_used,
  l.messages_per_month,   u.messages_used,
  l.max_users_can_create, u.users_created,
  l.notes, l.updated_at
FROM public.user_limits l
LEFT JOIN public.profiles p ON p.id = l.user_id
LEFT JOIN public.user_usage_current_month u ON u.user_id = l.user_id;

GRANT SELECT ON public.user_limits_with_usage TO authenticated, service_role;
