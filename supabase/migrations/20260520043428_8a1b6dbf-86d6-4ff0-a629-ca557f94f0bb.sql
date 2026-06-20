CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON public.user_permissions(user_id);

DROP POLICY IF EXISTS "users view own profile" ON public.profiles;
CREATE POLICY "users view own profile" ON public.profiles FOR SELECT TO authenticated USING (((id = (select auth.uid())) OR has_role((select auth.uid()), 'admin'::app_role)));

DROP POLICY IF EXISTS "users update own profile" ON public.profiles;
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE TO authenticated USING ((id = (select auth.uid())));

DROP POLICY IF EXISTS "admins update any profile" ON public.profiles;
CREATE POLICY "admins update any profile" ON public.profiles FOR UPDATE TO authenticated USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "auth view profiles" ON public.profiles;
CREATE POLICY "auth view profiles" ON public.profiles FOR SELECT TO authenticated USING (((select auth.uid()) IS NOT NULL));

DROP POLICY IF EXISTS "users see own roles" ON public.user_roles;
CREATE POLICY "users see own roles" ON public.user_roles FOR SELECT TO authenticated USING (((user_id = (select auth.uid())) OR has_role((select auth.uid()), 'admin'::app_role)));

DROP POLICY IF EXISTS "admins manage roles" ON public.user_roles;
CREATE POLICY "admins manage roles" ON public.user_roles FOR ALL TO authenticated USING (has_role((select auth.uid()), 'admin'::app_role)) WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "users see own perms" ON public.user_permissions;
CREATE POLICY "users see own perms" ON public.user_permissions FOR SELECT TO authenticated USING (((user_id = (select auth.uid())) OR has_role((select auth.uid()), 'admin'::app_role)));

DROP POLICY IF EXISTS "admins manage perms" ON public.user_permissions;
CREATE POLICY "admins manage perms" ON public.user_permissions FOR ALL TO authenticated USING (has_role((select auth.uid()), 'admin'::app_role)) WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "admins manage categories" ON public.categories;
CREATE POLICY "admins manage categories" ON public.categories FOR ALL TO authenticated USING (has_role((select auth.uid()), 'admin'::app_role)) WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "admins manage products" ON public.products;
CREATE POLICY "admins manage products" ON public.products FOR ALL TO authenticated USING (has_role((select auth.uid()), 'admin'::app_role)) WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "admins manage product_variants" ON public.product_variants;
CREATE POLICY "admins manage product_variants" ON public.product_variants FOR ALL TO authenticated USING (has_role((select auth.uid()), 'admin'::app_role)) WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "admins manage product external refs" ON public.product_external_refs;
CREATE POLICY "admins manage product external refs" ON public.product_external_refs FOR ALL TO authenticated USING (has_role((select auth.uid()), 'admin'::app_role)) WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "admins manage couriers" ON public.couriers;
CREATE POLICY "admins manage couriers" ON public.couriers FOR ALL TO authenticated USING (has_role((select auth.uid()), 'admin'::app_role)) WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "admins delete orders" ON public.orders;
CREATE POLICY "admins delete orders" ON public.orders FOR DELETE TO authenticated USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "staff with manage_orders update orders" ON public.orders;
CREATE POLICY "staff with manage_orders update orders" ON public.orders FOR UPDATE TO authenticated USING (user_has_permission((select auth.uid()), 'can_manage_orders'::text)) WITH CHECK (user_has_permission((select auth.uid()), 'can_manage_orders'::text));

DROP POLICY IF EXISTS "staff with manage_orders create orders" ON public.orders;
CREATE POLICY "staff with manage_orders create orders" ON public.orders FOR INSERT TO authenticated WITH CHECK (user_has_permission((select auth.uid()), 'can_manage_orders'::text));

DROP POLICY IF EXISTS "staff with manage_orders create order_items" ON public.order_items;
CREATE POLICY "staff with manage_orders create order_items" ON public.order_items FOR INSERT TO authenticated WITH CHECK (user_has_permission((select auth.uid()), 'can_manage_orders'::text));

DROP POLICY IF EXISTS "staff with manage_orders delete order_items" ON public.order_items;
CREATE POLICY "staff with manage_orders delete order_items" ON public.order_items FOR DELETE TO authenticated USING (user_has_permission((select auth.uid()), 'can_manage_orders'::text));

DROP POLICY IF EXISTS "staff with manage_orders update order_items" ON public.order_items;
CREATE POLICY "staff with manage_orders update order_items" ON public.order_items FOR UPDATE TO authenticated USING (user_has_permission((select auth.uid()), 'can_manage_orders'::text)) WITH CHECK (user_has_permission((select auth.uid()), 'can_manage_orders'::text));

DROP POLICY IF EXISTS "admins manage integrations" ON public.integrations;
CREATE POLICY "admins manage integrations" ON public.integrations FOR ALL TO authenticated USING (has_role((select auth.uid()), 'admin'::app_role)) WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "auth create expenses" ON public.expenses;
CREATE POLICY "auth create expenses" ON public.expenses FOR INSERT TO authenticated WITH CHECK (((select auth.uid()) IS NOT NULL));

DROP POLICY IF EXISTS "owners or admin update expenses" ON public.expenses;
CREATE POLICY "owners or admin update expenses" ON public.expenses FOR UPDATE TO authenticated USING (((created_by = (select auth.uid())) OR has_role((select auth.uid()), 'admin'::app_role))) WITH CHECK (((created_by = (select auth.uid())) OR has_role((select auth.uid()), 'admin'::app_role)));

DROP POLICY IF EXISTS "owners or admin delete expenses" ON public.expenses;
CREATE POLICY "owners or admin delete expenses" ON public.expenses FOR DELETE TO authenticated USING (((created_by = (select auth.uid())) OR has_role((select auth.uid()), 'admin'::app_role)));

DROP POLICY IF EXISTS "admins manage app_settings" ON public.app_settings;
CREATE POLICY "admins manage app_settings" ON public.app_settings FOR ALL TO authenticated USING (has_role((select auth.uid()), 'admin'::app_role)) WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "admins manage sms_settings" ON public.sms_settings;
CREATE POLICY "admins manage sms_settings" ON public.sms_settings FOR ALL TO authenticated USING (has_role((select auth.uid()), 'admin'::app_role)) WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "auth insert sms_logs" ON public.sms_logs;
CREATE POLICY "auth insert sms_logs" ON public.sms_logs FOR INSERT TO authenticated WITH CHECK (((select auth.uid()) IS NOT NULL));

DROP POLICY IF EXISTS "admins manage imported_customers" ON public.imported_customers;
CREATE POLICY "admins manage imported_customers" ON public.imported_customers FOR ALL TO authenticated USING (has_role((select auth.uid()), 'admin'::app_role)) WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "admins manage order_sources" ON public.order_sources;
CREATE POLICY "admins manage order_sources" ON public.order_sources FOR ALL TO authenticated USING (has_role((select auth.uid()), 'admin'::app_role)) WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "admins manage telesales_assignments" ON public.telesales_assignments;
CREATE POLICY "admins manage telesales_assignments" ON public.telesales_assignments FOR ALL TO authenticated USING (has_role((select auth.uid()), 'admin'::app_role)) WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "staff view own telesales_assignments" ON public.telesales_assignments;
CREATE POLICY "staff view own telesales_assignments" ON public.telesales_assignments FOR SELECT TO authenticated USING (((assigned_to = (select auth.uid())) OR has_role((select auth.uid()), 'admin'::app_role)));

DROP POLICY IF EXISTS "staff update own telesales_assignments" ON public.telesales_assignments;
CREATE POLICY "staff update own telesales_assignments" ON public.telesales_assignments FOR UPDATE TO authenticated USING (((assigned_to = (select auth.uid())) OR has_role((select auth.uid()), 'admin'::app_role))) WITH CHECK (((assigned_to = (select auth.uid())) OR has_role((select auth.uid()), 'admin'::app_role)));

DROP POLICY IF EXISTS "auth view telesales_call_logs" ON public.telesales_call_logs;
CREATE POLICY "auth view telesales_call_logs" ON public.telesales_call_logs FOR SELECT TO authenticated USING ((has_role((select auth.uid()), 'admin'::app_role) OR (EXISTS (SELECT 1 FROM telesales_assignments a WHERE ((a.id = telesales_call_logs.assignment_id) AND (a.assigned_to = (select auth.uid())))))));

DROP POLICY IF EXISTS "auth create telesales_call_logs" ON public.telesales_call_logs;
CREATE POLICY "auth create telesales_call_logs" ON public.telesales_call_logs FOR INSERT TO authenticated WITH CHECK ((has_role((select auth.uid()), 'admin'::app_role) OR (EXISTS (SELECT 1 FROM telesales_assignments a WHERE ((a.id = telesales_call_logs.assignment_id) AND (a.assigned_to = (select auth.uid())))))));

DROP POLICY IF EXISTS "admins manage facebook_settings" ON public.facebook_settings;
CREATE POLICY "admins manage facebook_settings" ON public.facebook_settings FOR ALL TO authenticated USING (has_role((select auth.uid()), 'admin'::app_role)) WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "admins manage facebook_pages" ON public.facebook_pages;
CREATE POLICY "admins manage facebook_pages" ON public.facebook_pages FOR ALL TO authenticated USING (has_role((select auth.uid()), 'admin'::app_role)) WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "auth insert facebook_webhook_logs" ON public.facebook_webhook_logs;
CREATE POLICY "auth insert facebook_webhook_logs" ON public.facebook_webhook_logs FOR INSERT TO authenticated WITH CHECK (((select auth.uid()) IS NOT NULL));

DROP POLICY IF EXISTS "auth create membership_customers" ON public.membership_customers;
CREATE POLICY "auth create membership_customers" ON public.membership_customers FOR INSERT TO authenticated WITH CHECK (((select auth.uid()) IS NOT NULL));

DROP POLICY IF EXISTS "auth update membership_customers" ON public.membership_customers;
CREATE POLICY "auth update membership_customers" ON public.membership_customers FOR UPDATE TO authenticated USING (((select auth.uid()) IS NOT NULL));

DROP POLICY IF EXISTS "admins delete membership_customers" ON public.membership_customers;
CREATE POLICY "admins delete membership_customers" ON public.membership_customers FOR DELETE TO authenticated USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "admins manage whatsapp_settings" ON public.whatsapp_settings;
CREATE POLICY "admins manage whatsapp_settings" ON public.whatsapp_settings FOR ALL TO authenticated USING (has_role((select auth.uid()), 'admin'::app_role)) WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "auth create message_templates" ON public.message_templates;
CREATE POLICY "auth create message_templates" ON public.message_templates FOR INSERT TO authenticated WITH CHECK (((select auth.uid()) IS NOT NULL));

DROP POLICY IF EXISTS "owners update message_templates" ON public.message_templates;
CREATE POLICY "owners update message_templates" ON public.message_templates FOR UPDATE TO authenticated USING (((created_by = (select auth.uid())) OR has_role((select auth.uid()), 'admin'::app_role)));

DROP POLICY IF EXISTS "owners delete message_templates" ON public.message_templates;
CREATE POLICY "owners delete message_templates" ON public.message_templates FOR DELETE TO authenticated USING (((created_by = (select auth.uid())) OR has_role((select auth.uid()), 'admin'::app_role)));

DROP POLICY IF EXISTS "auth insert whatsapp_logs" ON public.whatsapp_logs;
CREATE POLICY "auth insert whatsapp_logs" ON public.whatsapp_logs FOR INSERT TO authenticated WITH CHECK (((select auth.uid()) IS NOT NULL));

DROP POLICY IF EXISTS "users view own prefs" ON public.user_preferences;
CREATE POLICY "users view own prefs" ON public.user_preferences FOR SELECT TO authenticated USING ((user_id = (select auth.uid())));

DROP POLICY IF EXISTS "users insert own prefs" ON public.user_preferences;
CREATE POLICY "users insert own prefs" ON public.user_preferences FOR INSERT TO authenticated WITH CHECK ((user_id = (select auth.uid())));

DROP POLICY IF EXISTS "users update own prefs" ON public.user_preferences;
CREATE POLICY "users update own prefs" ON public.user_preferences FOR UPDATE TO authenticated USING ((user_id = (select auth.uid()))) WITH CHECK ((user_id = (select auth.uid())));

DROP POLICY IF EXISTS "admins manage meta_ads_accounts" ON public.meta_ads_accounts;
CREATE POLICY "admins manage meta_ads_accounts" ON public.meta_ads_accounts FOR ALL TO authenticated USING (has_role((select auth.uid()), 'admin'::app_role)) WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "admins manage meta_ad_expenses" ON public.meta_ad_expenses;
CREATE POLICY "admins manage meta_ad_expenses" ON public.meta_ad_expenses FOR ALL TO authenticated USING (has_role((select auth.uid()), 'admin'::app_role)) WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "admins manage warehouses" ON public.warehouses;
CREATE POLICY "admins manage warehouses" ON public.warehouses FOR ALL TO authenticated USING (has_role((select auth.uid()), 'admin'::app_role)) WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "staff manage_orders insert warehouses" ON public.warehouses;
CREATE POLICY "staff manage_orders insert warehouses" ON public.warehouses FOR INSERT TO authenticated WITH CHECK ((has_role((select auth.uid()), 'admin'::app_role) OR (EXISTS (SELECT 1 FROM user_permissions up WHERE ((up.user_id = (select auth.uid())) AND up.can_manage_orders)))));

DROP POLICY IF EXISTS "admins manage suppliers" ON public.suppliers;
CREATE POLICY "admins manage suppliers" ON public.suppliers FOR ALL TO authenticated USING (has_role((select auth.uid()), 'admin'::app_role)) WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "staff manage_orders manage suppliers" ON public.suppliers;
CREATE POLICY "staff manage_orders manage suppliers" ON public.suppliers FOR INSERT TO authenticated WITH CHECK ((has_role((select auth.uid()), 'admin'::app_role) OR (EXISTS (SELECT 1 FROM user_permissions up WHERE ((up.user_id = (select auth.uid())) AND up.can_manage_orders)))));

DROP POLICY IF EXISTS "staff manage_orders update suppliers" ON public.suppliers;
CREATE POLICY "staff manage_orders update suppliers" ON public.suppliers FOR UPDATE TO authenticated USING ((has_role((select auth.uid()), 'admin'::app_role) OR (EXISTS (SELECT 1 FROM user_permissions up WHERE ((up.user_id = (select auth.uid())) AND up.can_manage_orders)))));

DROP POLICY IF EXISTS "admins manage supplier_returns" ON public.supplier_returns;
CREATE POLICY "admins manage supplier_returns" ON public.supplier_returns FOR ALL TO authenticated USING (has_role((select auth.uid()), 'admin'::app_role)) WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "auth insert supplier_returns" ON public.supplier_returns;
CREATE POLICY "auth insert supplier_returns" ON public.supplier_returns FOR INSERT TO authenticated WITH CHECK (((select auth.uid()) IS NOT NULL));

DROP POLICY IF EXISTS "auth insert inventory_transactions" ON public.inventory_transactions;
CREATE POLICY "auth insert inventory_transactions" ON public.inventory_transactions FOR INSERT TO authenticated WITH CHECK (((select auth.uid()) IS NOT NULL));

DROP POLICY IF EXISTS "admins delete inventory_transactions" ON public.inventory_transactions;
CREATE POLICY "admins delete inventory_transactions" ON public.inventory_transactions FOR DELETE TO authenticated USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "auth insert supplier_purchases" ON public.supplier_purchases;
CREATE POLICY "auth insert supplier_purchases" ON public.supplier_purchases FOR INSERT TO authenticated WITH CHECK (((select auth.uid()) IS NOT NULL));

DROP POLICY IF EXISTS "admins manage supplier_purchases" ON public.supplier_purchases;
CREATE POLICY "admins manage supplier_purchases" ON public.supplier_purchases FOR ALL TO authenticated USING (has_role((select auth.uid()), 'admin'::app_role)) WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "auth insert purchase_items" ON public.supplier_purchase_items;
CREATE POLICY "auth insert purchase_items" ON public.supplier_purchase_items FOR INSERT TO authenticated WITH CHECK (((select auth.uid()) IS NOT NULL));

DROP POLICY IF EXISTS "admins manage purchase_items" ON public.supplier_purchase_items;
CREATE POLICY "admins manage purchase_items" ON public.supplier_purchase_items FOR ALL TO authenticated USING (has_role((select auth.uid()), 'admin'::app_role)) WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "auth insert supplier_payments" ON public.supplier_payments;
CREATE POLICY "auth insert supplier_payments" ON public.supplier_payments FOR INSERT TO authenticated WITH CHECK (((select auth.uid()) IS NOT NULL));

DROP POLICY IF EXISTS "admins manage supplier_payments" ON public.supplier_payments;
CREATE POLICY "admins manage supplier_payments" ON public.supplier_payments FOR ALL TO authenticated USING (has_role((select auth.uid()), 'admin'::app_role)) WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "auth insert order_history" ON public.order_history;
CREATE POLICY "auth insert order_history" ON public.order_history FOR INSERT TO authenticated WITH CHECK (((select auth.uid()) IS NOT NULL));

DROP POLICY IF EXISTS "auth view tasks" ON public.tasks;
CREATE POLICY "auth view tasks" ON public.tasks FOR SELECT TO authenticated USING ((has_role((select auth.uid()), 'admin'::app_role) OR (assigned_to = (select auth.uid())) OR (assigned_by = (select auth.uid()))));

DROP POLICY IF EXISTS "auth create tasks" ON public.tasks;
CREATE POLICY "auth create tasks" ON public.tasks FOR INSERT TO authenticated WITH CHECK (((select auth.uid()) IS NOT NULL));

DROP POLICY IF EXISTS "involved update tasks" ON public.tasks;
CREATE POLICY "involved update tasks" ON public.tasks FOR UPDATE TO authenticated USING ((has_role((select auth.uid()), 'admin'::app_role) OR (assigned_to = (select auth.uid())) OR (assigned_by = (select auth.uid())))) WITH CHECK (((assigned_to = (select auth.uid())) OR (assigned_by = (select auth.uid()))));

DROP POLICY IF EXISTS "admins delete tasks" ON public.tasks;
CREATE POLICY "admins delete tasks" ON public.tasks FOR DELETE TO authenticated USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "view task_history for involved" ON public.task_history;
CREATE POLICY "view task_history for involved" ON public.task_history FOR SELECT TO authenticated USING ((has_role((select auth.uid()), 'admin'::app_role) OR (EXISTS (SELECT 1 FROM tasks t WHERE ((t.id = task_history.task_id) AND ((t.assigned_to = (select auth.uid())) OR (t.assigned_by = (select auth.uid()))))))));

DROP POLICY IF EXISTS "insert task_history when involved" ON public.task_history;
CREATE POLICY "insert task_history when involved" ON public.task_history FOR INSERT TO authenticated WITH CHECK ((has_role((select auth.uid()), 'admin'::app_role) OR (EXISTS (SELECT 1 FROM tasks t WHERE ((t.id = task_history.task_id) AND ((t.assigned_to = (select auth.uid())) OR (t.assigned_by = (select auth.uid()))))))));

DROP POLICY IF EXISTS "auth insert customer_tags" ON public.customer_tags;
CREATE POLICY "auth insert customer_tags" ON public.customer_tags FOR INSERT TO authenticated WITH CHECK (((select auth.uid()) IS NOT NULL));

DROP POLICY IF EXISTS "owners or admin update customer_tags" ON public.customer_tags;
CREATE POLICY "owners or admin update customer_tags" ON public.customer_tags FOR UPDATE TO authenticated USING (((created_by = (select auth.uid())) OR has_role((select auth.uid()), 'admin'::app_role))) WITH CHECK (((created_by = (select auth.uid())) OR has_role((select auth.uid()), 'admin'::app_role)));

DROP POLICY IF EXISTS "owners or admin delete customer_tags" ON public.customer_tags;
CREATE POLICY "owners or admin delete customer_tags" ON public.customer_tags FOR DELETE TO authenticated USING (((created_by = (select auth.uid())) OR has_role((select auth.uid()), 'admin'::app_role)));

DROP POLICY IF EXISTS "admins manage customer_tag_discounts" ON public.customer_tag_discounts;
CREATE POLICY "admins manage customer_tag_discounts" ON public.customer_tag_discounts FOR ALL TO authenticated USING (has_role((select auth.uid()), 'admin'::app_role)) WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "admins manage expense_rules" ON public.expense_rules;
CREATE POLICY "admins manage expense_rules" ON public.expense_rules FOR ALL TO authenticated USING (has_role((select auth.uid()), 'admin'::app_role)) WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "admins manage telesales_compensation" ON public.telesales_compensation;
CREATE POLICY "admins manage telesales_compensation" ON public.telesales_compensation FOR ALL TO authenticated USING (has_role((select auth.uid()), 'admin'::app_role)) WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "admins manage blocked_customers" ON public.blocked_customers;
CREATE POLICY "admins manage blocked_customers" ON public.blocked_customers FOR ALL TO authenticated USING (has_role((select auth.uid()), 'admin'::app_role)) WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "staff with manage_orders can insert blocked_customers" ON public.blocked_customers;
CREATE POLICY "staff with manage_orders can insert blocked_customers" ON public.blocked_customers FOR INSERT TO authenticated WITH CHECK ((has_role((select auth.uid()), 'admin'::app_role) OR (EXISTS (SELECT 1 FROM user_permissions up WHERE ((up.user_id = (select auth.uid())) AND (up.can_manage_orders = true))))));

DROP POLICY IF EXISTS "staff with manage_orders can delete blocked_customers" ON public.blocked_customers;
CREATE POLICY "staff with manage_orders can delete blocked_customers" ON public.blocked_customers FOR DELETE TO authenticated USING ((has_role((select auth.uid()), 'admin'::app_role) OR (EXISTS (SELECT 1 FROM user_permissions up WHERE ((up.user_id = (select auth.uid())) AND (up.can_manage_orders = true))))));