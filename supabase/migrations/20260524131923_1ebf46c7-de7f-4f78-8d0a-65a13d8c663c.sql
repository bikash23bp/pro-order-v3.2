
DROP FUNCTION IF EXISTS public.get_courier_credentials();

CREATE OR REPLACE FUNCTION public.get_courier_credentials()
RETURNS TABLE (
  id uuid,
  name text,
  base_url text,
  api_key text,
  secret_key text,
  status text,
  is_default boolean,
  kind text,
  logo_url text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
          OR public.user_has_permission(auth.uid(), 'can_manage_courier_api')
          OR public.user_has_permission(auth.uid(), 'can_manage_couriers')) THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT c.id, c.name, c.base_url, c.api_key, c.secret_key, c.status::text,
           c.is_default, c.kind::text, c.logo_url, c.created_at
    FROM public.couriers c
    ORDER BY c.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_courier_credentials() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_courier_credentials() TO authenticated;
