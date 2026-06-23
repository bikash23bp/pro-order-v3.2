-- ============================================================
-- 1) Column-level GRANT: hide secrets/PII from broad authenticated SELECT
-- ============================================================

-- app_settings — hide bdcourier_api_key
REVOKE SELECT ON public.app_settings FROM authenticated;
GRANT SELECT (
  id, vip_spend_threshold, vip_order_threshold, updated_at,
  active_invoice_template, active_sticker_template, invoice_year, invoice_seq,
  logo_url, business_name, business_phone, business_address,
  return_delivery_charge, return_packing_cost,
  invoice_prefix, invoice_suffix, invoice_include_year, invoice_pad_length,
  default_order_template_desktop, default_order_template_mobile,
  membership_discount_enabled, membership_discount_rate,
  default_tele_template_desktop, default_tele_template_mobile,
  report_courier_charge
) ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

-- couriers — hide api_key, secret_key
REVOKE SELECT ON public.couriers FROM authenticated;
GRANT SELECT (
  id, name, base_url, status, created_at, updated_at,
  is_default, kind, logo_url, sticker_template_id, invoice_template_id, provider
) ON public.couriers TO authenticated;
GRANT ALL ON public.couriers TO service_role;

-- facebook_pages — hide access_token
REVOKE SELECT ON public.facebook_pages FROM authenticated;
GRANT SELECT (
  id, page_id, page_name, status, token_status, connected_at, updated_at
) ON public.facebook_pages TO authenticated;
GRANT ALL ON public.facebook_pages TO service_role;

-- oms_destinations — hide api_token
REVOKE SELECT ON public.oms_destinations FROM authenticated;
GRANT SELECT (
  id, name, url, auto_forward, active, created_by, created_at, updated_at, products_url
) ON public.oms_destinations TO authenticated;
GRANT ALL ON public.oms_destinations TO service_role;

-- blocked_customers — hide ip_address
REVOKE SELECT ON public.blocked_customers FROM authenticated;
GRANT SELECT (
  id, phone_normalized, reason, blocked_by, created_at, updated_at
) ON public.blocked_customers TO authenticated;
GRANT ALL ON public.blocked_customers TO service_role;

-- ============================================================
-- 2) Drop broad "auth view" SELECT policies on admin-only tables
--    (admin ALL policies already cover SELECT for admins)
-- ============================================================
DROP POLICY IF EXISTS "auth view facebook_settings" ON public.facebook_settings;
DROP POLICY IF EXISTS "auth view sms_settings"      ON public.sms_settings;
DROP POLICY IF EXISTS "auth view whatsapp_settings" ON public.whatsapp_settings;

-- ============================================================
-- 3) telesales_compensation — own row OR admin
-- ============================================================
DROP POLICY IF EXISTS "auth view telesales_compensation" ON public.telesales_compensation;
CREATE POLICY "view own or admin telesales_compensation"
  ON public.telesales_compensation
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.has_role((SELECT auth.uid()), 'admin'::app_role)
  );

-- ============================================================
-- 4) membership_customers — staff/manager/admin only (PII)
-- ============================================================
DROP POLICY IF EXISTS "auth view membership_customers" ON public.membership_customers;
CREATE POLICY "staff view membership_customers"
  ON public.membership_customers
  FOR SELECT TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'admin'::app_role)
    OR public.has_role((SELECT auth.uid()), 'business_owner'::app_role)
    OR public.has_role((SELECT auth.uid()), 'manager'::app_role)
    OR public.user_has_permission((SELECT auth.uid()), 'can_manage_orders')
  );

-- ============================================================
-- 5) SECURITY DEFINER functions — block anon / PUBLIC execute
-- ============================================================
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, PUBLIC;
GRANT  EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;