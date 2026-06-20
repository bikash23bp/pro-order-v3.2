
-- Lock down secret columns to service_role only; provide admin-only RPCs for UI reads.

-- 1) couriers: api_key, secret_key
REVOKE SELECT (api_key, secret_key) ON public.couriers FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_courier_credentials()
RETURNS TABLE (
  id uuid,
  name text,
  base_url text,
  api_key text,
  secret_key text,
  status text
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
          OR public.user_has_permission(auth.uid(), 'can_manage_courier_api')) THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT c.id, c.name, c.base_url, c.api_key, c.secret_key, c.status::text
    FROM public.couriers c
    ORDER BY c.name;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_courier_credentials() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_courier_credentials() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_courier_credential_by_id(p_courier_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  base_url text,
  api_key text,
  secret_key text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '28000';
  END IF;
  RETURN QUERY
    SELECT c.id, c.name, c.base_url, c.api_key, c.secret_key
    FROM public.couriers c
    WHERE c.id = p_courier_id
    LIMIT 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_courier_credential_by_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_courier_credential_by_id(uuid) TO authenticated;

-- 2) app_settings: bdcourier_api_key
REVOKE SELECT (bdcourier_api_key) ON public.app_settings FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_bdcourier_api_key()
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_key text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
          OR public.user_has_permission(auth.uid(), 'can_access_settings')) THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  SELECT bdcourier_api_key INTO v_key FROM public.app_settings WHERE id = true LIMIT 1;
  RETURN v_key;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_bdcourier_api_key() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_bdcourier_api_key() TO authenticated;

-- 3) facebook_settings: app_secret, access_token, verify_token, webhook_secret
REVOKE SELECT (app_secret, access_token, verify_token, webhook_secret)
  ON public.facebook_settings FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_facebook_settings_admin()
RETURNS SETOF public.facebook_settings
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
          OR public.user_has_permission(auth.uid(), 'can_access_settings')) THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.facebook_settings WHERE id = true LIMIT 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_facebook_settings_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_facebook_settings_admin() TO authenticated;

-- 4) whatsapp_settings: api_token
REVOKE SELECT (api_token) ON public.whatsapp_settings FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_whatsapp_settings_admin()
RETURNS SETOF public.whatsapp_settings
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
          OR public.user_has_permission(auth.uid(), 'can_access_settings')
          OR public.user_has_permission(auth.uid(), 'can_manage_messaging')) THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.whatsapp_settings WHERE id = true LIMIT 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_whatsapp_settings_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_settings_admin() TO authenticated;
