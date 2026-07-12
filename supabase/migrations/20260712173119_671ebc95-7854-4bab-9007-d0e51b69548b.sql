DROP POLICY IF EXISTS oms_dest_authenticated_read ON public.oms_destinations;
DROP POLICY IF EXISTS oms_dest_admin_all ON public.oms_destinations;
DROP POLICY IF EXISTS oms_inbound_admin_all ON public.oms_inbound_settings;
DROP POLICY IF EXISTS oms_logs_authenticated_insert ON public.oms_forward_logs;
DROP POLICY IF EXISTS oms_logs_admin_read ON public.oms_forward_logs;

CREATE POLICY oms_destinations_manager_access
ON public.oms_destinations
FOR ALL
TO authenticated
USING (public.user_has_permission(auth.uid(), 'can_manage_oms_endpoints'))
WITH CHECK (public.user_has_permission(auth.uid(), 'can_manage_oms_endpoints'));

CREATE POLICY oms_inbound_settings_manager_access
ON public.oms_inbound_settings
FOR ALL
TO authenticated
USING (public.user_has_permission(auth.uid(), 'can_manage_oms_endpoints'))
WITH CHECK (public.user_has_permission(auth.uid(), 'can_manage_oms_endpoints'));

CREATE POLICY oms_forward_logs_authorized_read
ON public.oms_forward_logs
FOR SELECT
TO authenticated
USING (
  public.user_has_permission(auth.uid(), 'can_manage_oms_endpoints')
  OR public.user_has_permission(auth.uid(), 'can_forward_orders')
  OR created_by = auth.uid()
);

CREATE POLICY oms_forward_logs_authorized_insert
ON public.oms_forward_logs
FOR INSERT
TO authenticated
WITH CHECK (
  public.user_has_permission(auth.uid(), 'can_manage_oms_endpoints')
  OR public.user_has_permission(auth.uid(), 'can_forward_orders')
  OR created_by = auth.uid()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oms_destinations TO authenticated;
GRANT ALL ON public.oms_destinations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oms_inbound_settings TO authenticated;
GRANT ALL ON public.oms_inbound_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oms_forward_logs TO authenticated;
GRANT ALL ON public.oms_forward_logs TO service_role;