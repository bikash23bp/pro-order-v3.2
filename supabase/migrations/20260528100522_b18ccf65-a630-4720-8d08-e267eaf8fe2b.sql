ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS screen_locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS screen_locked_by uuid;

CREATE OR REPLACE FUNCTION public.admin_lock_user_screen(target uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'business_owner')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.profiles
    SET screen_locked_at = now(), screen_locked_by = auth.uid()
    WHERE id = target;
END;
$$;

CREATE OR REPLACE FUNCTION public.unlock_my_screen()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
    SET screen_locked_at = NULL, screen_locked_by = NULL
    WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_lock_user_screen(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_my_screen() TO authenticated;