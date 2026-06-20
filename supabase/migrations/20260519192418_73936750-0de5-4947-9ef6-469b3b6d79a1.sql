-- Phase 3: Additional performance indexes
-- Most critical indexes (orders, order_items) already exist. Adding remaining gaps.

-- Expenses are filtered by date range in reports
CREATE INDEX IF NOT EXISTS idx_expenses_incurred_on ON public.expenses (incurred_on DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category_incurred ON public.expenses (category, incurred_on DESC);

-- WooCommerce incomplete sync logs filtered by integration
CREATE INDEX IF NOT EXISTS idx_wp_sync_logs_integration_created ON public.wp_incomplete_sync_logs (integration_id, created_at DESC);

-- Inventory transactions: rollback / lookup by order reference
CREATE INDEX IF NOT EXISTS idx_inv_tx_reference ON public.inventory_transactions (reference_type, reference_id);

-- Facebook webhook logs: lookup by linked order
CREATE INDEX IF NOT EXISTS idx_fb_webhook_logs_order ON public.facebook_webhook_logs (order_id) WHERE order_id IS NOT NULL;

-- Order items: variant index already exists; add product for stock joins
CREATE INDEX IF NOT EXISTS idx_order_items_product ON public.order_items (product_id);

-- Tasks: composite for "my pending tasks"
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to_status ON public.tasks (assigned_to, status);

-- Telesales: composite for assignee+status lists
CREATE INDEX IF NOT EXISTS idx_telesales_assigned_status ON public.telesales_assignments (assigned_to, status);

-- Membership lookup by phone (normalized variant via lower())
CREATE INDEX IF NOT EXISTS idx_membership_phone_lower ON public.membership_customers (lower(phone));

-- Order history insertions: created_by for audit views
CREATE INDEX IF NOT EXISTS idx_order_history_changed_by ON public.order_history (changed_by, created_at DESC);

-- Refresh planner stats so new indexes get used immediately
ANALYZE public.expenses;
ANALYZE public.wp_incomplete_sync_logs;
ANALYZE public.inventory_transactions;
ANALYZE public.facebook_webhook_logs;
ANALYZE public.order_items;
ANALYZE public.tasks;
ANALYZE public.telesales_assignments;
ANALYZE public.membership_customers;
ANALYZE public.order_history;
ANALYZE public.orders;