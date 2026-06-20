DROP POLICY IF EXISTS "admins create any profile" ON public.profiles;
CREATE POLICY "admins create any profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "users create own profile" ON public.profiles;
CREATE POLICY "users create own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());