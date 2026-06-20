CREATE OR REPLACE FUNCTION public.get_user_display_names(p_ids uuid[])
RETURNS TABLE(id uuid, display_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, COALESCE(NULLIF(btrim(p.full_name), ''), p.email, 'User')
  FROM public.profiles p
  WHERE p.id = ANY(p_ids);
$$;

GRANT EXECUTE ON FUNCTION public.get_user_display_names(uuid[]) TO authenticated;