
-- sms_logs
DROP POLICY IF EXISTS "auth view sms_logs" ON public.sms_logs;
CREATE POLICY "staff view sms_logs" ON public.sms_logs FOR SELECT
USING (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'business_owner') OR has_role(auth.uid(),'manager')
  OR user_has_any_permission(auth.uid(), ARRAY['can_manage_orders','can_view_orders','can_send_messages'])
);

-- whatsapp_logs
DROP POLICY IF EXISTS "auth view whatsapp_logs" ON public.whatsapp_logs;
CREATE POLICY "staff view whatsapp_logs" ON public.whatsapp_logs FOR SELECT
USING (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'business_owner') OR has_role(auth.uid(),'manager')
  OR user_has_any_permission(auth.uid(), ARRAY['can_manage_orders','can_view_orders','can_send_messages'])
);

-- customer_complaints
DROP POLICY IF EXISTS "auth view customer_complaints" ON public.customer_complaints;
CREATE POLICY "staff view customer_complaints" ON public.customer_complaints FOR SELECT
USING (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'business_owner') OR has_role(auth.uid(),'manager')
  OR user_has_any_permission(auth.uid(), ARRAY['can_manage_orders','can_view_orders'])
  OR created_by = auth.uid()
);

-- imported_customers
DROP POLICY IF EXISTS "auth view imported_customers" ON public.imported_customers;

-- expense_rules
DROP POLICY IF EXISTS "auth view expense_rules" ON public.expense_rules;
CREATE POLICY "staff view expense_rules" ON public.expense_rules FOR SELECT
USING (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'business_owner')
  OR user_has_any_permission(auth.uid(), ARRAY['can_view_reports','can_manage_expenses'])
);

-- inactivity_lock_events
DROP POLICY IF EXISTS "auth view inactivity_lock_events" ON public.inactivity_lock_events;
CREATE POLICY "self or admin view inactivity_lock_events" ON public.inactivity_lock_events FOR SELECT
USING (
  user_id = auth.uid()
  OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'business_owner') OR has_role(auth.uid(),'manager')
);

-- meta_ad_expenses
DROP POLICY IF EXISTS "auth view meta_ad_expenses" ON public.meta_ad_expenses;
CREATE POLICY "staff view meta_ad_expenses" ON public.meta_ad_expenses FOR SELECT
USING (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'business_owner')
  OR user_has_any_permission(auth.uid(), ARRAY['can_view_reports','can_view_marketing_reports'])
);

NOTIFY pgrst, 'reload schema';
