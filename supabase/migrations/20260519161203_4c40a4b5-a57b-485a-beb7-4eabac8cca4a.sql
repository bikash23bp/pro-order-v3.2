
-- 1. Trigger-only SECURITY DEFINER functions: revoke from public/anon/authenticated entirely
DO $$
DECLARE
  fn text;
  trigger_fns text[] := ARRAY[
    'tasks_log_history()',
    'assign_purchase_number()',
    'supplier_return_stock_out()',
    'order_item_log_sale()',
    'set_updated_at()',
    'decrement_stock()',
    'purchase_item_stock_in()',
    'orders_log_history()',
    'enforce_max_integrations()',
    'protect_main_admin_role()',
    'assign_invoice_number()',
    'tasks_set_timestamps()',
    'handle_new_user()',
    'protect_main_admin_perms()',
    'adjust_stock_for_order_items()'
  ];
BEGIN
  FOREACH fn IN ARRAY trigger_fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
  END LOOP;
END $$;

-- 2. RPC-callable functions: revoke from anon, keep authenticated
DO $$
DECLARE
  fn text;
  rpc_fns text[] := ARRAY[
    'is_phone_blocked(text)',
    'has_role(uuid, app_role)',
    'bulk_update_order_status(uuid[], order_status)',
    'update_order_with_items(uuid, text, text, text, numeric, numeric, numeric, text, text, jsonb)',
    'count_orders_by_phone(text, uuid)',
    'is_main_admin(uuid)',
    'get_user_display_names(uuid[])',
    'create_order_with_items(text, text, text, text, uuid, numeric, numeric, numeric, numeric, numeric, text, text, jsonb)',
    'import_legacy_order(text, text, text, text, timestamptz, order_status, numeric, numeric, numeric, jsonb)',
    'list_assignable_users()',
    'search_task_customers(text)',
    'task_assignment_stats(timestamptz, timestamptz)',
    'normalize_phone(text)',
    'create_supplier_purchase(uuid, uuid, date, numeric, numeric, text, jsonb)',
    'create_supplier_purchase(uuid, uuid, numeric, numeric, jsonb)'
  ];
BEGIN
  FOREACH fn IN ARRAY rpc_fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', fn);
  END LOOP;
END $$;

-- 3. Storage: restrict listing on public buckets to signed-in users.
-- Direct public URL access (/object/public/...) still works for unauthenticated visitors;
-- only the list/search endpoint is gated.
DROP POLICY IF EXISTS "Avatars are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Courier logos are publicly viewable" ON storage.objects;

CREATE POLICY "Authenticated can list avatars"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'avatars');

CREATE POLICY "Authenticated can list courier logos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'courier-logos');

-- product-images already lacks a broad SELECT policy; nothing to change there.
