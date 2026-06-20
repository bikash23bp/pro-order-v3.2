-- Customer tag enum and table
CREATE TYPE public.customer_tag AS ENUM ('new_customer','interested','vip','silver','gold','premium');

CREATE TABLE public.customer_tags (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone text NOT NULL,
  tag public.customer_tag NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (phone, tag)
);

CREATE INDEX idx_customer_tags_phone ON public.customer_tags(phone);
CREATE INDEX idx_customer_tags_tag ON public.customer_tags(tag);

ALTER TABLE public.customer_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth view customer_tags" ON public.customer_tags
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth insert customer_tags" ON public.customer_tags
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "owners or admin delete customer_tags" ON public.customer_tags
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));