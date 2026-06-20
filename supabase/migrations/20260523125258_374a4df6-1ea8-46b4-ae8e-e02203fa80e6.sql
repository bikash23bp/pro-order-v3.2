-- 1. Add new enum value
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'business_owner';

-- 2. Update has_role so business_owner is treated as admin everywhere
-- (uses text comparison to avoid using the new enum literal in same tx)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        role = _role
        OR (_role::text = 'admin' AND role::text = 'business_owner')
      )
  )
$$;