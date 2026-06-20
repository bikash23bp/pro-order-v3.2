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
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email), NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;

  -- Only auto-grant a role to known admin emails. Everyone else stays roleless
  -- until an admin explicitly assigns them a role (createStaffUser flow).
  IF is_admin THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::app_role)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Always create a permissions row so admin updates can target it.
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
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END; $function$;