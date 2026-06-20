
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  is_static_admin boolean := lower(coalesce(NEW.email, '')) IN ('bikash23bp@gmail.com', 'mozumdarproducts509@gmail.com', 'bikashchandro48@gmail.com');
  invite_row public.pending_user_invites%ROWTYPE;
  has_invite boolean := false;
  final_role public.app_role;
  full_access boolean := false;
  invite_perms jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO invite_row
  FROM public.pending_user_invites
  WHERE email_normalized = lower(coalesce(NEW.email, ''))
    AND used_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  has_invite := FOUND;
  -- DEFAULT to 'staff' so every new signup can log in immediately.
  final_role := CASE
    WHEN is_static_admin THEN 'admin'::public.app_role
    WHEN has_invite THEN invite_row.role
    ELSE 'staff'::public.app_role
  END;
  full_access := is_static_admin OR final_role = 'admin'::public.app_role;
  invite_perms := CASE WHEN has_invite THEN invite_row.permissions ELSE '{}'::jsonb END;

  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', invite_row.full_name, NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
    avatar_url = COALESCE(public.profiles.avatar_url, EXCLUDED.avatar_url);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, final_role)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.user_permissions (
    user_id,
    can_delete, can_access_settings, can_manage_users, can_manage_couriers,
    can_manage_products, can_view_reports, can_view_dashboard, can_view_orders,
    can_manage_orders, can_change_order_status, can_view_web_orders,
    can_manage_telesales, can_manage_marketing, can_manage_messaging,
    can_manage_invoice_settings, can_create_users, can_import_data,
    can_export_data, can_view_staff_report, can_view_profit, can_view_loss,
    can_manage_courier_api
  )
  VALUES (
    NEW.id,
    full_access OR COALESCE((invite_perms->>'can_delete')::boolean, false),
    full_access OR COALESCE((invite_perms->>'can_access_settings')::boolean, false),
    full_access OR COALESCE((invite_perms->>'can_manage_users')::boolean, false),
    full_access OR COALESCE((invite_perms->>'can_manage_couriers')::boolean, false),
    full_access OR COALESCE((invite_perms->>'can_manage_products')::boolean, false),
    full_access OR COALESCE((invite_perms->>'can_view_reports')::boolean, false),
    -- view defaults true so staff can see dashboard/orders immediately
    full_access OR COALESCE((invite_perms->>'can_view_dashboard')::boolean, true),
    full_access OR COALESCE((invite_perms->>'can_view_orders')::boolean, true),
    full_access OR COALESCE((invite_perms->>'can_manage_orders')::boolean, false),
    full_access OR COALESCE((invite_perms->>'can_change_order_status')::boolean, false),
    full_access OR COALESCE((invite_perms->>'can_view_web_orders')::boolean, false),
    full_access OR COALESCE((invite_perms->>'can_manage_telesales')::boolean, false),
    full_access OR COALESCE((invite_perms->>'can_manage_marketing')::boolean, false),
    full_access OR COALESCE((invite_perms->>'can_manage_messaging')::boolean, false),
    full_access OR COALESCE((invite_perms->>'can_manage_invoice_settings')::boolean, false),
    full_access OR COALESCE((invite_perms->>'can_create_users')::boolean, false),
    full_access OR COALESCE((invite_perms->>'can_import_data')::boolean, false),
    full_access OR COALESCE((invite_perms->>'can_export_data')::boolean, false),
    full_access OR COALESCE((invite_perms->>'can_view_staff_report')::boolean, false),
    full_access OR COALESCE((invite_perms->>'can_view_profit')::boolean, false),
    full_access OR COALESCE((invite_perms->>'can_view_loss')::boolean, false),
    full_access OR COALESCE((invite_perms->>'can_manage_courier_api')::boolean, false)
  )
  ON CONFLICT (user_id) DO NOTHING;

  IF has_invite THEN
    UPDATE public.pending_user_invites
    SET used_at = now()
    WHERE id = invite_row.id;
  END IF;

  RETURN NEW;
END;
$function$;

-- Backfill: any existing auth users without a role get default 'staff'
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'staff'::public.app_role
FROM auth.users u
LEFT JOIN public.user_roles r ON r.user_id = u.id
WHERE r.user_id IS NULL
ON CONFLICT DO NOTHING;

-- Ensure they also have a permissions row (view dashboard + orders by default)
INSERT INTO public.user_permissions (user_id, can_view_dashboard, can_view_orders)
SELECT u.id, true, true
FROM auth.users u
LEFT JOIN public.user_permissions p ON p.user_id = u.id
WHERE p.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- And a profile row
INSERT INTO public.profiles (id, email, full_name)
SELECT u.id, u.email, COALESCE(u.raw_user_meta_data->>'full_name', u.email)
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;
