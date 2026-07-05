DROP POLICY IF EXISTS "Authenticated users can view order status counts" ON public.order_status_counts;
DROP POLICY IF EXISTS "Users with all order access can view order status counts" ON public.order_status_counts;

CREATE POLICY "Users with all order access can view order status counts"
ON public.order_status_counts
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.user_id = auth.uid()
      AND COALESCE(up.can_view_all_orders, false)
  )
);