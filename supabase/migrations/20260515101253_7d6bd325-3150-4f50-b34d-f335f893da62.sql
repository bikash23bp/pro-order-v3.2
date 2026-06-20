
-- expenses table
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  category text,
  incurred_on date NOT NULL DEFAULT (now()::date),
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth view expenses" ON public.expenses
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth create expenses" ON public.expenses
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "admins update expenses" ON public.expenses
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admins delete expenses" ON public.expenses
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER expenses_set_updated_at
BEFORE UPDATE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses;

-- bulk status update
CREATE OR REPLACE FUNCTION public.bulk_update_order_status(p_ids uuid[], p_status order_status)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in' USING ERRCODE = '28000';
  END IF;
  UPDATE public.orders SET status = p_status, updated_at = now()
   WHERE id = ANY(p_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- update order with items (rewrites order_items, recomputes totals, adjusts stock)
CREATE OR REPLACE FUNCTION public.update_order_with_items(
  p_order_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_address text,
  p_delivery_charge numeric,
  p_discount_amount numeric,
  p_advance_amount numeric,
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
  v_group record;
  v_product public.products;
  v_subtotal numeric := 0;
  v_total numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one order item is required' USING ERRCODE = '23514';
  END IF;

  -- Restore stock from existing items, then delete (trigger will re-apply on insert)
  DELETE FROM public.order_items WHERE order_id = p_order_id;

  FOR v_group IN
    SELECT
      (item->>'product_id')::uuid AS product_id,
      SUM((item->>'quantity')::int) AS quantity,
      AVG(COALESCE(NULLIF(item->>'unit_price','')::numeric, 0)) AS unit_price
    FROM jsonb_array_elements(p_items) AS item
    GROUP BY (item->>'product_id')::uuid
  LOOP
    SELECT * INTO v_product FROM public.products WHERE id = v_group.product_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found: %', v_group.product_id USING ERRCODE = '23503';
    END IF;
    IF v_group.quantity IS NULL OR v_group.quantity <= 0 THEN
      RAISE EXCEPTION 'Quantity must be at least 1 for %', v_product.name USING ERRCODE = '23514';
    END IF;
    IF v_product.stock_quantity < v_group.quantity THEN
      RAISE EXCEPTION 'Not enough stock for % (% in stock, % requested)',
        v_product.name, v_product.stock_quantity, v_group.quantity USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.order_items (order_id, product_id, quantity, unit_price)
    VALUES (p_order_id, v_group.product_id, v_group.quantity, v_group.unit_price);

    v_subtotal := v_subtotal + (v_group.quantity * v_group.unit_price);
  END LOOP;

  v_total := v_subtotal + COALESCE(p_delivery_charge,0) - COALESCE(p_discount_amount,0);

  UPDATE public.orders SET
    customer_name = btrim(p_customer_name),
    customer_phone = btrim(p_customer_phone),
    customer_address = btrim(p_customer_address),
    delivery_charge = COALESCE(p_delivery_charge, 0),
    discount_amount = COALESCE(p_discount_amount, 0),
    advance_amount = COALESCE(p_advance_amount, 0),
    invoice_note = NULLIF(btrim(COALESCE(p_invoice_note,'')), ''),
    internal_note = NULLIF(btrim(COALESCE(p_internal_note,'')), ''),
    subtotal = v_subtotal,
    total_amount = v_total,
    updated_at = now()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$$;
