CREATE OR REPLACE FUNCTION public.get_repeat_phones_array()
RETURNS text[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(array_agg(phone_key), ARRAY[]::text[])
  FROM public.get_repeat_phones_v2();
$$;

GRANT EXECUTE ON FUNCTION public.get_repeat_phones_array() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_duplicate_active_phones_array()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'phones', COALESCE(jsonb_agg(DISTINCT phone_key) FILTER (WHERE phone_key IS NOT NULL), '[]'::jsonb),
    'emails', COALESCE(jsonb_agg(DISTINCT customer_email) FILTER (WHERE customer_email IS NOT NULL), '[]'::jsonb),
    'phonesNormalized', COALESCE(jsonb_agg(DISTINCT phone_normalized) FILTER (WHERE phone_normalized IS NOT NULL), '[]'::jsonb)
  )
  FROM public.get_duplicate_active_phones_v2();
$$;

GRANT EXECUTE ON FUNCTION public.get_duplicate_active_phones_array() TO authenticated, service_role;