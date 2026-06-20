INSERT INTO public.profiles (id, email, full_name, is_blocked)
VALUES ('489a60cf-0ff5-4201-9f4e-db1541e0b7a2', 'bikash23bp@gmail.com', 'Bikash (Super Admin)', false)
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, is_blocked = false;

INSERT INTO public.user_roles (user_id, role)
VALUES ('489a60cf-0ff5-4201-9f4e-db1541e0b7a2', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.user_permissions (
  user_id, can_delete, can_access_settings, can_manage_users, can_manage_couriers,
  can_manage_products, can_view_reports, can_view_dashboard, can_view_orders,
  can_manage_orders, can_change_order_status, can_view_web_orders, can_manage_telesales,
  can_manage_marketing, can_manage_messaging, can_manage_invoice_settings, can_create_users,
  can_import_data, can_export_data, can_view_staff_report, can_view_profit, can_view_loss,
  can_manage_courier_api, can_manage_passwords, can_manage_inactivity_lock
) VALUES (
  '489a60cf-0ff5-4201-9f4e-db1541e0b7a2',
  true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true
) ON CONFLICT (user_id) DO UPDATE SET
  can_delete=true,can_access_settings=true,can_manage_users=true,can_manage_couriers=true,
  can_manage_products=true,can_view_reports=true,can_view_dashboard=true,can_view_orders=true,
  can_manage_orders=true,can_change_order_status=true,can_view_web_orders=true,can_manage_telesales=true,
  can_manage_marketing=true,can_manage_messaging=true,can_manage_invoice_settings=true,can_create_users=true,
  can_import_data=true,can_export_data=true,can_view_staff_report=true,can_view_profit=true,can_view_loss=true,
  can_manage_courier_api=true,can_manage_passwords=true,can_manage_inactivity_lock=true;