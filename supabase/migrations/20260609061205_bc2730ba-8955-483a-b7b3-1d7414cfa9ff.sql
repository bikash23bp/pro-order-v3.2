DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'advance_payment_sources','app_settings','blocked_customers','categories','chat_messages',
    'couriers','customer_complaints','customer_tag_discounts','customer_tags','expense_rules',
    'expenses','facebook_pages','facebook_settings','facebook_webhook_logs','imported_customers',
    'inactivity_lock_events','inactivity_lock_pauses','integrations','inventory_transactions',
    'membership_customers','message_templates','meta_ad_expenses','meta_ads_accounts','note_templates',
    'order_custom_fields','order_history','order_items','order_sources','orders','pending_user_invites',
    'product_external_refs','product_mother_links','product_variants','products','sms_logs',
    'sms_settings','staff_sessions','supplier_payments','supplier_purchase_items','supplier_purchases',
    'supplier_returns','suppliers','task_history','tasks','telesales_assignments','telesales_call_logs',
    'telesales_compensation','user_permissions','user_preferences','warehouses','webhook_logs',
    'whatsapp_logs','whatsapp_settings','wp_incomplete_sync_logs'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER', t);
    EXECUTE format('TRUNCATE TABLE public.%I CASCADE', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO sandbox_exec', t);
  END LOOP;
END $$;