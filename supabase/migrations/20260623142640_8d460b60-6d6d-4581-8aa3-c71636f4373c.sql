-- 1) Fix Security Definer View
ALTER VIEW public.incomplete_orders SET (security_invoker = true);

-- 2) membership_customers — tighten INSERT/UPDATE to staff only
DROP POLICY IF EXISTS "auth create membership_customers" ON public.membership_customers;
DROP POLICY IF EXISTS "auth update membership_customers" ON public.membership_customers;

CREATE POLICY "staff create membership_customers"
  ON public.membership_customers
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role((SELECT auth.uid()), 'admin'::app_role)
    OR public.has_role((SELECT auth.uid()), 'business_owner'::app_role)
    OR public.has_role((SELECT auth.uid()), 'manager'::app_role)
    OR public.user_has_permission((SELECT auth.uid()), 'can_manage_orders')
  );

CREATE POLICY "staff update membership_customers"
  ON public.membership_customers
  FOR UPDATE TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'admin'::app_role)
    OR public.has_role((SELECT auth.uid()), 'business_owner'::app_role)
    OR public.has_role((SELECT auth.uid()), 'manager'::app_role)
    OR public.user_has_permission((SELECT auth.uid()), 'can_manage_orders')
  )
  WITH CHECK (
    public.has_role((SELECT auth.uid()), 'admin'::app_role)
    OR public.has_role((SELECT auth.uid()), 'business_owner'::app_role)
    OR public.has_role((SELECT auth.uid()), 'manager'::app_role)
    OR public.user_has_permission((SELECT auth.uid()), 'can_manage_orders')
  );