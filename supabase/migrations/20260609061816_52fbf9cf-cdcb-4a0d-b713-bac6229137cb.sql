DO $$
DECLARE t text;
  tables text[] := ARRAY[
    'order_items','inventory_transactions','product_mother_links','supplier_purchase_items','supplier_returns',
    'supplier_payments','order_custom_fields','order_history','product_external_refs','product_variants',
    'orders','telesales_call_logs','task_history','supplier_purchases','meta_ad_expenses','products',
    'user_preferences','user_permissions','wp_incomplete_sync_logs','whatsapp_settings','whatsapp_logs',
    'webhook_logs','warehouses','telesales_compensation','telesales_assignments','tasks','suppliers',
    'staff_sessions','sms_settings','sms_logs','pending_user_invites','order_sources','note_templates',
    'meta_ads_accounts','message_templates','membership_customers','integrations','inactivity_lock_pauses',
    'inactivity_lock_events','imported_customers','facebook_webhook_logs','facebook_settings','facebook_pages',
    'expenses','expense_rules','customer_tags','customer_tag_discounts','customer_complaints','couriers',
    'chat_messages','categories','blocked_customers','app_settings','advance_payment_sources'];
BEGIN
  FOREACH t IN ARRAY tables LOOP EXECUTE format('TRUNCATE TABLE public.%I CASCADE', t); END LOOP;
END $$;