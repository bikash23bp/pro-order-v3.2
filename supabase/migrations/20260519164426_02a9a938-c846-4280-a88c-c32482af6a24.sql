-- Helper: check a single permission flag for a user.
CREATE OR REPLACE FUNCTION public.user_has_permission(_user_id uuid, _perm text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_ok boolean;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;
  IF public.has_role(_user_id, 'admin'::app_role) THEN RETURN true; END IF;
  EXECUTE format('SELECT COALESCE((SELECT %I FROM public.user_permissions WHERE user_id = $1), false)', _perm)
    INTO v_ok USING _user_id;
  RETURN COALESCE(v_ok, false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.user_has_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_permission(uuid, text) TO authenticated;

-- Replace permissive UPDATE policy on orders.
DROP POLICY IF EXISTS "auth update orders" ON public.orders;

CREATE POLICY "staff with manage_orders update orders"
ON public.orders
FOR UPDATE
TO authenticated
USING (public.user_has_permission(auth.uid(), 'can_manage_orders'))
WITH CHECK (public.user_has_permission(auth.uid(), 'can_manage_orders'));

-- Tighten INSERT on orders too: only manage_orders staff or admins.
DROP POLICY IF EXISTS "auth create orders" ON public.orders;

CREATE POLICY "staff with manage_orders create orders"
ON public.orders
FOR INSERT
TO authenticated
WITH CHECK (public.user_has_permission(auth.uid(), 'can_manage_orders'));

-- order_items: same gating (RLS currently allows any signed-in user).
DROP POLICY IF EXISTS "auth create order items" ON public.order_items;

CREATE POLICY "staff with manage_orders create order_items"
ON public.order_items
FOR INSERT
TO authenticated
WITH CHECK (public.user_has_permission(auth.uid(), 'can_manage_orders'));

-- bulk_update_order_status: enforce permission inside the function as well,
-- since it is SECURITY DEFINER and bypasses RLS.
CREATE OR REPLACE FUNCTION public.bulk_update_order_status(p_ids uuid[], p_status order_status)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.user_has_permission(auth.uid(), 'can_manage_orders')
       OR public.user_has_permission(auth.uid(), 'can_change_order_status')) THEN
    RAISE EXCEPTION 'You do not have permission to change order status' USING ERRCODE = '42501';
  END IF;
  UPDATE public.orders SET status = p_status, updated_at = now()
   WHERE id = ANY(p_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;