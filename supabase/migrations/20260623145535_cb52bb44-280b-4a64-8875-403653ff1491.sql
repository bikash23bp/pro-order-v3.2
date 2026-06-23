
-- 1. Replace broad USING(true) SELECT policies with staff-only policies
DROP POLICY IF EXISTS "auth view app_settings" ON public.app_settings;
CREATE POLICY "staff view app_settings" ON public.app_settings
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'business_owner'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'staff'::app_role)
  );

DROP POLICY IF EXISTS "auth view blocked_customers" ON public.blocked_customers;
CREATE POLICY "staff view blocked_customers" ON public.blocked_customers
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'business_owner'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR user_has_permission(auth.uid(), 'can_manage_orders'::text)
  );

DROP POLICY IF EXISTS "auth view couriers" ON public.couriers;
CREATE POLICY "staff view couriers" ON public.couriers
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'business_owner'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'staff'::app_role)
  );

DROP POLICY IF EXISTS "auth view facebook_pages" ON public.facebook_pages;
CREATE POLICY "staff view facebook_pages" ON public.facebook_pages
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'business_owner'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'staff'::app_role)
  );

DROP POLICY IF EXISTS "auth view facebook_webhook_logs" ON public.facebook_webhook_logs;
CREATE POLICY "staff view facebook_webhook_logs" ON public.facebook_webhook_logs
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'business_owner'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

DROP POLICY IF EXISTS "auth view webhook_logs" ON public.webhook_logs;
CREATE POLICY "staff view webhook_logs" ON public.webhook_logs
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'business_owner'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

DROP POLICY IF EXISTS "oms_dest_authenticated_read" ON public.oms_destinations;
CREATE POLICY "staff view oms_destinations" ON public.oms_destinations
  FOR SELECT TO authenticated
  USING (
    active = true AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'business_owner'::app_role)
      OR has_role(auth.uid(), 'manager'::app_role)
      OR has_role(auth.uid(), 'staff'::app_role)
    )
  );

-- 2. Fix always-true insert policy on oms_forward_logs
DROP POLICY IF EXISTS "oms_logs_authenticated_insert" ON public.oms_forward_logs;
CREATE POLICY "oms_logs_staff_insert" ON public.oms_forward_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'business_owner'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'staff'::app_role)
  );

-- 3. Revoke EXECUTE on trigger-only SECURITY DEFINER functions from public/anon/authenticated
DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'adjust_stock_for_order_items()',
    'adjust_stock_on_order_status_change()',
    'assign_invoice_number()',
    'assign_purchase_number()',
    'cascade_mother_consume()',
    'enforce_max_integrations()',
    'order_item_log_sale()',
    'orders_log_history()',
    'protect_inactivity_lock_fields()',
    'protect_main_admin_perms()',
    'protect_main_admin_role()',
    'purchase_item_stock_in()',
    'set_complaints_updated_at()',
    'set_updated_at()',
    'supplier_return_stock_out()',
    'tasks_log_history()',
    'tasks_set_timestamps()',
    'touch_advance_payment_sources_updated_at()',
    'update_notices_updated_at()',
    'update_updated_at_column()',
    'validate_advance_payment()'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
  END LOOP;
END $$;
