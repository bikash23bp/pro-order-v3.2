CREATE TABLE public.order_sources (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.order_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth view order_sources" ON public.order_sources FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage order_sources" ON public.order_sources FOR ALL TO authenticated USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));

INSERT INTO public.order_sources (name) VALUES
  ('Unknown'),('FB'),('Web'),('Direct'),('Instagram'),('TikTok'),('WhatsApp');

ALTER TABLE public.orders ADD COLUMN order_source_id uuid REFERENCES public.order_sources(id) ON DELETE SET NULL;
CREATE INDEX idx_orders_order_source_id ON public.orders(order_source_id);
