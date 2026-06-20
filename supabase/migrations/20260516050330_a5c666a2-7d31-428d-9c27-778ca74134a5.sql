
-- Helper: is this user the main admin (by email in auth.users)?
CREATE OR REPLACE FUNCTION public.is_main_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = _user_id AND lower(email) = 'bikash23bp@gmail.com'
  );
$$;

-- Block role changes/removal for main admin
CREATE OR REPLACE FUNCTION public.protect_main_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF public.is_main_admin(OLD.user_id) AND OLD.role = 'admin'::app_role THEN
      RAISE EXCEPTION 'Main admin role cannot be removed';
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF public.is_main_admin(OLD.user_id) AND OLD.role = 'admin'::app_role
       AND NEW.role <> 'admin'::app_role THEN
      RAISE EXCEPTION 'Main admin role cannot be changed';
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_main_admin_role ON public.user_roles;
CREATE TRIGGER trg_protect_main_admin_role
BEFORE UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.protect_main_admin_role();

-- Force main admin permissions to stay all-true
CREATE OR REPLACE FUNCTION public.protect_main_admin_perms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF public.is_main_admin(OLD.user_id) THEN
      RAISE EXCEPTION 'Main admin permissions cannot be removed';
    END IF;
    RETURN OLD;
  END IF;

  IF public.is_main_admin(NEW.user_id) THEN
    NEW.can_delete := true;
    NEW.can_access_settings := true;
    NEW.can_manage_users := true;
    NEW.can_manage_couriers := true;
    NEW.can_manage_products := true;
    NEW.can_view_reports := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_main_admin_perms ON public.user_permissions;
CREATE TRIGGER trg_protect_main_admin_perms
BEFORE INSERT OR UPDATE OR DELETE ON public.user_permissions
FOR EACH ROW EXECUTE FUNCTION public.protect_main_admin_perms();

-- Re-assert main admin state right now (idempotent)
DO $$
DECLARE v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = 'bikash23bp@gmail.com' LIMIT 1;
  IF v_uid IS NOT NULL THEN
    DELETE FROM public.user_roles WHERE user_id = v_uid AND role <> 'admin'::app_role;
    INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'admin'::app_role)
      ON CONFLICT DO NOTHING;
    INSERT INTO public.user_permissions (user_id, can_delete, can_access_settings, can_manage_users, can_manage_couriers, can_manage_products, can_view_reports)
    VALUES (v_uid, true, true, true, true, true, true)
    ON CONFLICT (user_id) DO UPDATE SET
      can_delete = true, can_access_settings = true, can_manage_users = true,
      can_manage_couriers = true, can_manage_products = true, can_view_reports = true;
  END IF;
END $$;
