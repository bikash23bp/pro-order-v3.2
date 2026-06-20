
ALTER TABLE public.user_permissions
  ADD COLUMN IF NOT EXISTS can_view_dashboard boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_orders boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_orders boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_change_order_status boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_web_orders boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_telesales boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_marketing boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_messaging boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_invoice_settings boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_create_users boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_import_data boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_export_data boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_staff_report boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_profit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_loss boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_courier_api boolean NOT NULL DEFAULT false;

-- Backfill: any user with admin role gets all permissions on
UPDATE public.user_permissions up
SET
  can_view_dashboard = true,
  can_view_orders = true,
  can_manage_orders = true,
  can_change_order_status = true,
  can_view_web_orders = true,
  can_manage_telesales = true,
  can_manage_marketing = true,
  can_manage_messaging = true,
  can_manage_invoice_settings = true,
  can_create_users = true,
  can_import_data = true,
  can_export_data = true,
  can_view_staff_report = true,
  can_view_profit = true,
  can_view_loss = true,
  can_manage_courier_api = true,
  updated_at = now()
WHERE EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = up.user_id AND ur.role = 'admin'::app_role
);

-- Keep main admin permissions locked-on for all current and future fields
CREATE OR REPLACE FUNCTION public.protect_main_admin_perms()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    NEW.can_view_dashboard := true;
    NEW.can_view_orders := true;
    NEW.can_manage_orders := true;
    NEW.can_change_order_status := true;
    NEW.can_view_web_orders := true;
    NEW.can_manage_telesales := true;
    NEW.can_manage_marketing := true;
    NEW.can_manage_messaging := true;
    NEW.can_manage_invoice_settings := true;
    NEW.can_create_users := true;
    NEW.can_import_data := true;
    NEW.can_export_data := true;
    NEW.can_view_staff_report := true;
    NEW.can_view_profit := true;
    NEW.can_view_loss := true;
    NEW.can_manage_courier_api := true;
  END IF;
  RETURN NEW;
END;
$function$;

-- handle_new_user — give new admins all permissions on by default
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_admin BOOLEAN := NEW.email IN ('bikash23bp@gmail.com', 'mozumdarproducts509@gmail.com', 'bikashchandro48@gmail.com');
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email), NEW.raw_user_meta_data->>'avatar_url');

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, CASE WHEN is_admin THEN 'admin'::app_role ELSE 'staff'::app_role END);

  INSERT INTO public.user_permissions (
    user_id, can_delete, can_access_settings, can_manage_users, can_manage_couriers, can_manage_products, can_view_reports,
    can_view_dashboard, can_view_orders, can_manage_orders, can_change_order_status, can_view_web_orders,
    can_manage_telesales, can_manage_marketing, can_manage_messaging, can_manage_invoice_settings, can_create_users,
    can_import_data, can_export_data, can_view_staff_report, can_view_profit, can_view_loss, can_manage_courier_api
  )
  VALUES (
    NEW.id, is_admin, is_admin, is_admin, is_admin, is_admin, is_admin,
    is_admin, is_admin, is_admin, is_admin, is_admin,
    is_admin, is_admin, is_admin, is_admin, is_admin,
    is_admin, is_admin, is_admin, is_admin, is_admin, is_admin
  );

  RETURN NEW;
END; $function$;
