
-- Auto-assign business_owner role to the very first signup (bootstrap),
-- so the system owner never waits in pending approval.
CREATE OR REPLACE FUNCTION public.handle_new_user_bootstrap_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If no role rows exist at all yet, this signup is the system owner.
  IF NOT EXISTS (SELECT 1 FROM public.user_roles LIMIT 1) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'business_owner')
    ON CONFLICT (user_id, role) DO NOTHING;

    -- Ensure a profile row exists for the bootstrap owner.
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_bootstrap_owner ON auth.users;
CREATE TRIGGER on_auth_user_created_bootstrap_owner
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_bootstrap_owner();

-- Backfill: if there are existing auth users but no roles yet,
-- promote the earliest one to business_owner.
DO $$
DECLARE
  first_user_id uuid;
  first_email text;
  first_name text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles LIMIT 1) THEN
    SELECT id, email, raw_user_meta_data->>'full_name'
      INTO first_user_id, first_email, first_name
      FROM auth.users
      ORDER BY created_at ASC
      LIMIT 1;

    IF first_user_id IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (first_user_id, 'business_owner')
      ON CONFLICT (user_id, role) DO NOTHING;

      INSERT INTO public.profiles (id, email, full_name)
      VALUES (first_user_id, first_email, COALESCE(first_name, first_email))
      ON CONFLICT (id) DO NOTHING;
    END IF;
  END IF;
END $$;
