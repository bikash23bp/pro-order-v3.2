CREATE POLICY "staff with manage_orders update order_items"
ON public.order_items
FOR UPDATE
TO authenticated
USING (public.user_has_permission(auth.uid(), 'can_manage_orders'))
WITH CHECK (public.user_has_permission(auth.uid(), 'can_manage_orders'));