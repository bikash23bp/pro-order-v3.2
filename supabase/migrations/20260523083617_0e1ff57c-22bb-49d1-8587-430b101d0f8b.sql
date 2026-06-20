CREATE OR REPLACE FUNCTION public.claim_pending_user_invite()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_user_id uuid := auth.uid();
  current_email text := lower(coalesce(auth.jwt()->>'email', ''));
  invite_row public.pending_user_invites%ROWTYPE;
  full_access boolean := false;
  invite_perms jsonb := '{}'::jsonb;
BEGIN
  IF current_user_id IS NULL OR current_email = '' THEN
    RETURN false;
  END IF;

  SELECT * INTO invite_row
  FROM public.pending_user_invites
  WHERE email_normalized = current_email
    AND used_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  full_access := invite_row.role = 'admin'::public.app_role;
  invite_perms := coalesce(invite_row.permissions, '{}'::jsonb);

  INSERT INTO public.profiles (id, email, full_name, is_blocked)
  VALUES (current_user_id, invite_row.email, coalesce(invite_row.full_name, invite_row.email), false)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = coalesce(public.profiles.full_name, EXCLUDED.full_name),
    is_blocked = false;

  DELETE FROM public.user_roles WHERE user_id = current_user_id;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (current_user_id, invite_row.role);

  INSERT INTO public.user_permissions (
    user_id,
    can_delete,
    can_access_settings,
    can_manage_users,
    can_manage_couriers,
    can_manage_products,
    can_view_reports,
    can_view_dashboard,
    can_view_orders,
    can_manage_orders,
    can_change_order_status,
    can_view_web_orders,
    can_manage_telesales,
    can_manage_marketing,
    can_manage_messaging,
    can_manage_invoice_settings,
    can_create_users,
    can_import_data,
    can_export_data,
    can_view_staff_report,
    can_view_profit,
    can_view_loss,
    can_manage_courier_api,
    can_manage_passwords,
    can_manage_inactivity_lock
  )
  VALUES (
    current_user_id,
    full_access OR coalesce((invite_perms->>'can_delete')::boolean, false),
    full_access OR coalesce((invite_perms->>'can_access_settings')::boolean, false),
    full_access OR coalesce((invite_perms->>'can_manage_users')::boolean, false),
    full_access OR coalesce((invite_perms->>'can_manage_couriers')::boolean, false),
    full_access OR coalesce((invite_perms->>'can_manage_products')::boolean, false),
    full_access OR coalesce((invite_perms->>'can_view_reports')::boolean, false),
    full_access OR coalesce((invite_perms->>'can_view_dashboard')::boolean, false),
    full_access OR coalesce((invite_perms->>'can_view_orders')::boolean, false),
    full_access OR coalesce((invite_perms->>'can_manage_orders')::boolean, false),
    full_access OR coalesce((invite_perms->>'can_change_order_status')::boolean, false),
    full_access OR coalesce((invite_perms->>'can_view_web_orders')::boolean, false),
    full_access OR coalesce((invite_perms->>'can_manage_telesales')::boolean, false),
    full_access OR coalesce((invite_perms->>'can_manage_marketing')::boolean, false),
    full_access OR coalesce((invite_perms->>'can_manage_messaging')::boolean, false),
    full_access OR coalesce((invite_perms->>'can_manage_invoice_settings')::boolean, false),
    full_access OR coalesce((invite_perms->>'can_create_users')::boolean, false),
    full_access OR coalesce((invite_perms->>'can_import_data')::boolean, false),
    full_access OR coalesce((invite_perms->>'can_export_data')::boolean, false),
    full_access OR coalesce((invite_perms->>'can_view_staff_report')::boolean, false),
    full_access OR coalesce((invite_perms->>'can_view_profit')::boolean, false),
    full_access OR coalesce((invite_perms->>'can_view_loss')::boolean, false),
    full_access OR coalesce((invite_perms->>'can_manage_courier_api')::boolean, false),
    full_access OR coalesce((invite_perms->>'can_manage_passwords')::boolean, false),
    full_access OR coalesce((invite_perms->>'can_manage_inactivity_lock')::boolean, false)
  )
  ON CONFLICT (user_id) DO UPDATE SET
    can_delete = EXCLUDED.can_delete,
    can_access_settings = EXCLUDED.can_access_settings,
    can_manage_users = EXCLUDED.can_manage_users,
    can_manage_couriers = EXCLUDED.can_manage_couriers,
    can_manage_products = EXCLUDED.can_manage_products,
    can_view_reports = EXCLUDED.can_view_reports,
    can_view_dashboard = EXCLUDED.can_view_dashboard,
    can_view_orders = EXCLUDED.can_view_orders,
    can_manage_orders = EXCLUDED.can_manage_orders,
    can_change_order_status = EXCLUDED.can_change_order_status,
    can_view_web_orders = EXCLUDED.can_view_web_orders,
    can_manage_telesales = EXCLUDED.can_manage_telesales,
    can_manage_marketing = EXCLUDED.can_manage_marketing,
    can_manage_messaging = EXCLUDED.can_manage_messaging,
    can_manage_invoice_settings = EXCLUDED.can_manage_invoice_settings,
    can_create_users = EXCLUDED.can_create_users,
    can_import_data = EXCLUDED.can_import_data,
    can_export_data = EXCLUDED.can_export_data,
    can_view_staff_report = EXCLUDED.can_view_staff_report,
    can_view_profit = EXCLUDED.can_view_profit,
    can_view_loss = EXCLUDED.can_view_loss,
    can_manage_courier_api = EXCLUDED.can_manage_courier_api,
    can_manage_passwords = EXCLUDED.can_manage_passwords,
    can_manage_inactivity_lock = EXCLUDED.can_manage_inactivity_lock,
    updated_at = now();

  UPDATE public.pending_user_invites
  SET used_at = now()
  WHERE id = invite_row.id;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_pending_user_invite() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_pending_user_invite() TO authenticated;