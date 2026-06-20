
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS inactivity_lock_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS inactivity_lock_seconds integer NOT NULL DEFAULT 1800;

-- Prevent non-admins from changing the lock settings on their own profile
CREATE OR REPLACE FUNCTION public.protect_inactivity_lock_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.inactivity_lock_enabled IS DISTINCT FROM OLD.inactivity_lock_enabled
      OR NEW.inactivity_lock_seconds IS DISTINCT FROM OLD.inactivity_lock_seconds)
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    NEW.inactivity_lock_enabled := OLD.inactivity_lock_enabled;
    NEW.inactivity_lock_seconds := OLD.inactivity_lock_seconds;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_inactivity_lock ON public.profiles;
CREATE TRIGGER trg_protect_inactivity_lock
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_inactivity_lock_fields();
