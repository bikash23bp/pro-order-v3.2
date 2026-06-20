CREATE OR REPLACE FUNCTION public.user_has_permission(_user_id uuid, _perm text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_ok boolean;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;
  IF public.has_role(_user_id, 'admin'::app_role) OR public.has_role(_user_id, 'business_owner'::app_role) THEN RETURN true; END IF;
  EXECUTE format('SELECT COALESCE((SELECT %I FROM public.user_permissions WHERE user_id = $1), false)', _perm)
    INTO v_ok USING _user_id;
  RETURN COALESCE(v_ok, false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.user_has_any_permission(_user_id uuid, _perms text[])
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  p text;
BEGIN
  IF _user_id IS NULL THEN
    RETURN false;
  END IF;

  IF public.has_role(_user_id, 'admin'::app_role) OR public.has_role(_user_id, 'business_owner'::app_role) THEN
    RETURN true;
  END IF;

  FOREACH p IN ARRAY _perms LOOP
    IF public.user_has_permission(_user_id, p) THEN
      RETURN true;
    END IF;
  END LOOP;

  RETURN false;
END;
$function$;

DROP POLICY IF EXISTS "admins manage imported_customers" ON public.imported_customers;
CREATE POLICY "admins manage imported_customers"
ON public.imported_customers
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'business_owner'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'business_owner'::app_role)
);

DROP POLICY IF EXISTS "admins manage telesales_assignments" ON public.telesales_assignments;
CREATE POLICY "admins manage telesales_assignments"
ON public.telesales_assignments
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'business_owner'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'business_owner'::app_role)
);

DROP POLICY IF EXISTS "staff update own telesales_assignments" ON public.telesales_assignments;
CREATE POLICY "staff update own telesales_assignments"
ON public.telesales_assignments
FOR UPDATE
TO authenticated
USING (
  assigned_to = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'business_owner'::app_role)
)
WITH CHECK (
  assigned_to = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'business_owner'::app_role)
);

DROP POLICY IF EXISTS "staff view own telesales_assignments" ON public.telesales_assignments;
CREATE POLICY "staff view own telesales_assignments"
ON public.telesales_assignments
FOR SELECT
TO authenticated
USING (
  assigned_to = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'business_owner'::app_role)
);

DROP POLICY IF EXISTS "admins delete orders" ON public.orders;
CREATE POLICY "admins delete orders"
ON public.orders
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'business_owner'::app_role)
);

SELECT setval(
  'public.orders_order_number_seq',
  COALESCE((SELECT MAX(order_number) FROM public.orders), 0) + 1,
  false
);