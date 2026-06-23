
CREATE INDEX IF NOT EXISTS idx_orders_status_created_at  ON public.orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_created_at         ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone     ON public.orders (customer_phone);
CREATE INDEX IF NOT EXISTS idx_orders_courier_id         ON public.orders (courier_id);
CREATE INDEX IF NOT EXISTS idx_orders_source             ON public.orders (source);
CREATE INDEX IF NOT EXISTS idx_orders_created_by         ON public.orders (created_by);
CREATE INDEX IF NOT EXISTS idx_orders_order_number       ON public.orders (order_number);
CREATE INDEX IF NOT EXISTS idx_orders_phone_normalized   ON public.orders (phone_normalized);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email_lower ON public.orders (lower(btrim(customer_email)));
CREATE INDEX IF NOT EXISTS idx_orders_preorder_date      ON public.orders (preorder_date) WHERE preorder = true;

CREATE INDEX IF NOT EXISTS idx_order_items_order_id      ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id    ON public.order_items (product_id);
CREATE INDEX IF NOT EXISTS idx_order_history_order_id    ON public.order_history (order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to_status  ON public.tasks (assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at          ON public.tasks (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_telesales_assign_user_status    ON public.telesales_assignments (assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_telesales_call_logs_assignment  ON public.telesales_call_logs (assignment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_membership_customers_phone      ON public.membership_customers (phone);
CREATE INDEX IF NOT EXISTS idx_blocked_customers_phone_norm    ON public.blocked_customers (phone_normalized);
CREATE INDEX IF NOT EXISTS idx_customer_complaints_phone       ON public.customer_complaints (phone);
CREATE INDEX IF NOT EXISTS idx_customer_complaints_order       ON public.customer_complaints (order_id);

CREATE INDEX IF NOT EXISTS idx_inv_tx_product_created      ON public.inventory_transactions (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON public.product_variants (product_id);

CREATE INDEX IF NOT EXISTS idx_expenses_incurred_on        ON public.expenses (incurred_on DESC);
CREATE INDEX IF NOT EXISTS idx_meta_ad_expenses_date       ON public.meta_ad_expenses (expense_date DESC);

CREATE INDEX IF NOT EXISTS idx_fb_webhook_logs_created     ON public.facebook_webhook_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fb_webhook_logs_order       ON public.facebook_webhook_logs (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created        ON public.webhook_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wp_incomplete_logs_created  ON public.wp_incomplete_sync_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_logs_created            ON public.sms_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_logs_order              ON public.sms_logs (order_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_created       ON public.whatsapp_logs (created_at DESC);

ANALYZE public.orders;
ANALYZE public.order_items;
