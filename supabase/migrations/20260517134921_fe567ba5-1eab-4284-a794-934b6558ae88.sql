CREATE OR REPLACE FUNCTION public.list_assignable_users()
RETURNS TABLE(id uuid, display_name text, email text, role app_role)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    p.id,
    COALESCE(NULLIF(btrim(p.full_name), ''), p.email, 'User') AS display_name,
    p.email,
    ur.role
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE auth.uid() IS NOT NULL
  ORDER BY display_name;
$$;

REVOKE EXECUTE ON FUNCTION public.list_assignable_users() FROM anon;
GRANT EXECUTE ON FUNCTION public.list_assignable_users() TO authenticated;