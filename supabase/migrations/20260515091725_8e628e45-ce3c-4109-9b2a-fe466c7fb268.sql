
-- Integrations table
CREATE TABLE IF NOT EXISTS public.integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL UNIQUE,
  site_url text,
  consumer_key text,
  consumer_secret text,
  webhook_secret text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage integrations"
  ON public.integrations FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_integrations_updated_at
  BEFORE UPDATE ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Orders: source + external id for webhook dedupe
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS external_order_id text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

CREATE UNIQUE INDEX IF NOT EXISTS orders_external_order_id_key
  ON public.orders(source, external_order_id)
  WHERE external_order_id IS NOT NULL;

-- Recreate stock decrement trigger
DROP TRIGGER IF EXISTS trg_decrement_stock ON public.order_items;
CREATE TRIGGER trg_decrement_stock
  AFTER INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.decrement_stock();

-- Atomic create-order RPC
CREATE OR REPLACE FUNCTION public.create_order_with_items(
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_customer_address text,
  p_courier_id uuid,
  p_delivery_charge numeric,
  p_discount_amount numeric,
  p_advance_amount numeric,
  p_subtotal numeric,
  p_total_amount numeric,
  p_invoice_note text,
  p_internal_note text,
  p_items jsonb
) RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders;
  v_item jsonb;
  v_product public.products;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validate stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_product FROM public.products WHERE id = (v_item->>'product_id')::uuid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found: %', v_item->>'product_id';
    END IF;
    IF v_product.stock_quantity < (v_item->>'quantity')::int THEN
      RAISE EXCEPTION 'Not enough stock for %', v_product.name;
    END IF;
  END LOOP;

  INSERT INTO public.orders (
    customer_name, customer_phone, customer_email, customer_address,
    courier_id, delivery_charge, discount_amount, advance_amount,
    subtotal, total_amount, invoice_note, internal_note, created_by, status, source
  ) VALUES (
    p_customer_name, p_customer_phone, p_customer_email, p_customer_address,
    p_courier_id, COALESCE(p_delivery_charge,0), COALESCE(p_discount_amount,0), COALESCE(p_advance_amount,0),
    p_subtotal, p_total_amount, p_invoice_note, p_internal_note, auth.uid(), 'processing'::order_status, 'manual'
  ) RETURNING * INTO v_order;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.order_items (order_id, product_id, quantity, unit_price)
    VALUES (
      v_order.id,
      (v_item->>'product_id')::uuid,
      (v_item->>'quantity')::int,
      (v_item->>'unit_price')::numeric
    );
  END LOOP;

  RETURN v_order;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_order_with_items(text,text,text,text,uuid,numeric,numeric,numeric,numeric,numeric,text,text,jsonb) TO authenticated;
