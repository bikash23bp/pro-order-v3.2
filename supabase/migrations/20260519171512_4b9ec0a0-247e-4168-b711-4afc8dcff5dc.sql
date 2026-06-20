CREATE OR REPLACE FUNCTION public.get_user_display_names(p_ids uuid[])
 RETURNS TABLE(id uuid, display_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id, COALESCE(NULLIF(btrim(p.full_name), ''), p.email, 'User') AS display_name
  FROM public.profiles p
  WHERE p.id = ANY(p_ids)
  UNION ALL
  SELECT '00000000-0000-0000-0000-000000000000'::uuid, 'System'
  WHERE '00000000-0000-0000-0000-000000000000'::uuid = ANY(p_ids);
$function$;
