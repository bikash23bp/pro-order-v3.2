-- Sensitive function gate (re-apply; previous migration rolled back)
CREATE OR REPLACE FUNCTION public.get_courier_credential_by_id(p_courier_id uuid)
 RETURNS TABLE(id uuid, name text, base_url text, api_key text, secret_key text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    SELECT c.id, c.name, c.base_url, c.api_key, c.secret_key
    FROM public.couriers c
    WHERE c.id = p_courier_id
    LIMIT 1;
END;
$function$;

-- Move extensions out of public via drop/recreate (pg_net does not support SET SCHEMA)
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

DROP EXTENSION IF EXISTS pg_net CASCADE;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DROP EXTENSION IF EXISTS postgres_fdw CASCADE;
CREATE EXTENSION IF NOT EXISTS postgres_fdw WITH SCHEMA extensions;