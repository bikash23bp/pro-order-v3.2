-- Run this ONCE on the AUDIT project (aecaylmfhggcmekzuwcu) SQL Editor.

-- 1) Schema usage
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- 2) Table & sequence privileges (RLS still enforces row-level rules)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL PRIVILEGES                ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT                 ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL PRIVILEGES                ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- 3) Future tables get the same grants automatically
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated;

-- 4) Super-admin email fallback inside has_role (matches main project)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    _user_id = (SELECT auth.uid())
    AND lower(auth.jwt() ->> 'email') = 'bikash23bp@gmail.com'
    AND _role IN ('admin', 'business_owner')
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;
