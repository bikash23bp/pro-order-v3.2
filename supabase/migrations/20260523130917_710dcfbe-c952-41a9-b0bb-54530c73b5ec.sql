-- Hide super admin (bikash23bp@gmail.com) from all other users including business_owner

-- Helper: is this user the super admin?
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id
      AND lower(coalesce(email, '')) = 'bikash23bp@gmail.com'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;

-- ===== profiles: hide super admin row from everyone except themselves =====
DROP POLICY IF EXISTS "auth view profiles" ON public.profiles;
DROP POLICY IF EXISTS "users view own profile" ON public.profiles;

CREATE POLICY "auth view non-super-admin profiles"
ON public.profiles FOR SELECT TO authenticated
USING (
  (SELECT auth.uid()) IS NOT NULL
  AND (
    id = (SELECT auth.uid())
    OR public.is_super_admin((SELECT auth.uid()))
    OR NOT public.is_super_admin(id)
  )
);

-- ===== user_roles: hide super admin's role row =====
DROP POLICY IF EXISTS "users see own roles" ON public.user_roles;

CREATE POLICY "users see own roles"
ON public.user_roles FOR SELECT TO authenticated
USING (
  (
    user_id = (SELECT auth.uid())
    OR has_role((SELECT auth.uid()), 'admin'::app_role)
  )
  AND (
    public.is_super_admin((SELECT auth.uid()))
    OR NOT public.is_super_admin(user_id)
  )
);

-- ===== user_permissions: hide super admin's permissions =====
DROP POLICY IF EXISTS "users see own perms" ON public.user_permissions;

CREATE POLICY "users see own perms"
ON public.user_permissions FOR SELECT TO authenticated
USING (
  (
    user_id = (SELECT auth.uid())
    OR has_role((SELECT auth.uid()), 'admin'::app_role)
  )
  AND (
    public.is_super_admin((SELECT auth.uid()))
    OR NOT public.is_super_admin(user_id)
  )
);

-- ===== get_user_display_names: mask super admin as "System" for non-super-admins =====
CREATE OR REPLACE FUNCTION public.get_user_display_names(p_ids uuid[])
 RETURNS TABLE(id uuid, display_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id,
    CASE
      WHEN lower(coalesce(p.email,'')) = 'bikash23bp@gmail.com'
        AND NOT public.is_super_admin((SELECT auth.uid()))
        THEN 'System'
      ELSE COALESCE(NULLIF(btrim(p.full_name), ''), p.email, 'User')
    END AS display_name
  FROM public.profiles p
  WHERE p.id = ANY(p_ids)
  UNION ALL
  SELECT '00000000-0000-0000-0000-000000000000'::uuid, 'System'
  WHERE '00000000-0000-0000-0000-000000000000'::uuid = ANY(p_ids);
$function$;