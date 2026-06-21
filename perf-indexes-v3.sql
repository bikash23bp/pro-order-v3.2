-- =====================================================
-- Performance indexes for personal backend (cmqqxjfadpfbtvlykcgz)
-- v3: fixed missing order_id on telesales_call_logs.
-- Safe to re-run: all indexes use IF NOT EXISTS.
-- =====================================================

-- Orders
CREATE INDEX IF NOT EXISTS idx_orders_status_created_at  ON public.orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_created_at         ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone     ON public.orders (customer_phone);
CREATE INDEX IF NOT EXISTS idx_orders_courier_id         ON public.orders (courier_id);
CREATE INDEX IF NOT EXISTS idx_orders_source             ON public.orders (source);
CREATE INDEX IF NOT EXISTS idx_orders_created_by         ON public.orders (created_by);
CREATE INDEX IF NOT EXISTS idx_orders_order_number       ON public.orders (order_number);

-- Order items / history
CREATE INDEX IF NOT EXISTS idx_order_items_order_id      ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id    ON public.order_items (product_id);
CREATE INDEX IF NOT EXISTS idx_order_history_order_id    ON public.order_history (order_id, created_at DESC);

-- Tasks
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to_status  ON public.tasks (assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at          ON public.tasks (created_at DESC);

-- Telesales
CREATE INDEX IF NOT EXISTS idx_telesales_assign_user_status  ON public.telesales_assignments (assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_telesales_call_logs_assignment ON public.telesales_call_logs (assignment_id, created_at DESC);

-- Customers
CREATE INDEX IF NOT EXISTS idx_membership_customers_phone ON public.membership_customers (phone);
CREATE INDEX IF NOT EXISTS idx_blocked_customers_phone    ON public.blocked_customers (phone);
CREATE INDEX IF NOT EXISTS idx_customer_complaints_phone  ON public.customer_complaints (phone);
CREATE INDEX IF NOT EXISTS idx_customer_complaints_order  ON public.customer_complaints (order_id);

-- Inventory / products
CREATE INDEX IF NOT EXISTS idx_inv_tx_product_created      ON public.inventory_transactions (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON public.product_variants (product_id);

-- Expenses
CREATE INDEX IF NOT EXISTS idx_expenses_date              ON public.expenses (date DESC);
CREATE INDEX IF NOT EXISTS idx_meta_ad_expenses_date      ON public.meta_ad_expenses (date DESC);

-- Logs (large append-only)
CREATE INDEX IF NOT EXISTS idx_fb_webhook_logs_created    ON public.facebook_webhook_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fb_webhook_logs_order      ON public.facebook_webhook_logs (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created       ON public.webhook_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wp_incomplete_logs_created ON public.wp_incomplete_sync_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_logs_created           ON public.sms_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_logs_order             ON public.sms_logs (order_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_created      ON public.whatsapp_logs (created_at DESC);

ANALYZE;