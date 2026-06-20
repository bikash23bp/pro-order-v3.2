
-- Custom columns saved during imports for orders
CREATE TABLE IF NOT EXISTS public.order_custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  key text NOT NULL,
  value text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, key)
);

CREATE INDEX IF NOT EXISTS idx_order_custom_fields_order_id
  ON public.order_custom_fields(order_id);

ALTER TABLE public.order_custom_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth view order_custom_fields"
  ON public.order_custom_fields FOR SELECT TO authenticated USING (true);

CREATE POLICY "staff with manage_orders insert order_custom_fields"
  ON public.order_custom_fields FOR INSERT TO authenticated
  WITH CHECK (user_has_permission((SELECT auth.uid()), 'can_manage_orders'));

CREATE POLICY "staff with manage_orders update order_custom_fields"
  ON public.order_custom_fields FOR UPDATE TO authenticated
  USING (user_has_permission((SELECT auth.uid()), 'can_manage_orders'))
  WITH CHECK (user_has_permission((SELECT auth.uid()), 'can_manage_orders'));

CREATE POLICY "staff with manage_orders delete order_custom_fields"
  ON public.order_custom_fields FOR DELETE TO authenticated
  USING (user_has_permission((SELECT auth.uid()), 'can_manage_orders'));
