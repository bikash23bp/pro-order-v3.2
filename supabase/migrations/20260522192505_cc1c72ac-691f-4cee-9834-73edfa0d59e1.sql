CREATE TABLE IF NOT EXISTS public.pending_user_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  email_normalized text GENERATED ALWAYS AS (lower(email)) STORED,
  full_name text,
  role public.app_role NOT NULL DEFAULT 'staff',
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  used_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.pending_user_invites ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_user_invites_email_active
  ON public.pending_user_invites (email_normalized)
  WHERE used_at IS NULL;

DROP TRIGGER IF EXISTS trg_pending_user_invites_updated ON public.pending_user_invites;
CREATE TRIGGER trg_pending_user_invites_updated
  BEFORE UPDATE ON public.pending_user_invites
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP POLICY IF EXISTS "admins view pending user invites" ON public.pending_user_invites;
CREATE POLICY "admins view pending user invites"
  ON public.pending_user_invites
  FOR SELECT
  TO authenticated
  USING (public.has_role((select auth.uid()), 'admin'::public.app_role));

DROP POLICY IF EXISTS "admins create pending user invites" ON public.pending_user_invites;
CREATE POLICY "admins create pending user invites"
  ON public.pending_user_invites
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role((select auth.uid()), 'admin'::public.app_role));

DROP POLICY IF EXISTS "admins update pending user invites" ON public.pending_user_invites;
CREATE POLICY "admins update pending user invites"
  ON public.pending_user_invites
  FOR UPDATE
  TO authenticated
  USING (public.has_role((select auth.uid()), 'admin'::public.app_role))
  WITH CHECK (public.has_role((select auth.uid()), 'admin'::public.app_role));

DROP POLICY IF EXISTS "admins delete pending user invites" ON public.pending_user_invites;
CREATE POLICY "admins delete pending user invites"
  ON public.pending_user_invites
  FOR DELETE
  TO authenticated
  USING (public.has_role((select auth.uid()), 'admin'::public.app_role));

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
  final_role := CASE
    WHEN is_static_admin THEN 'admin'::public.app_role
    WHEN has_invite THEN invite_row.role
    ELSE NULL
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

  IF final_role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, final_role)
    ON CONFLICT DO NOTHING;
  END IF;

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
    NEW.id,
    full_access OR COALESCE((invite_perms->>'can_delete')::boolean, false),
    full_access OR COALESCE((invite_perms->>'can_access_settings')::boolean, false),
    full_access OR COALESCE((invite_perms->>'can_manage_users')::boolean, false),
    full_access OR COALESCE((invite_perms->>'can_manage_couriers')::boolean, false),
    full_access OR COALESCE((invite_perms->>'can_manage_products')::boolean, false),
    full_access OR COALESCE((invite_perms->>'can_view_reports')::boolean, false),
    full_access OR COALESCE((invite_perms->>'can_view_dashboard')::boolean, false),
    full_access OR COALESCE((invite_perms->>'can_view_orders')::boolean, false),
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
    full_access OR COALESCE((invite_perms->>'can_manage_courier_api')::boolean, false),
    full_access OR COALESCE((invite_perms->>'can_manage_passwords')::boolean, false),
    full_access OR COALESCE((invite_perms->>'can_manage_inactivity_lock')::boolean, false)
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

  IF has_invite THEN
    UPDATE public.pending_user_invites
    SET used_at = now()
    WHERE id = invite_row.id;
  END IF;

  RETURN NEW;
END; $function$;