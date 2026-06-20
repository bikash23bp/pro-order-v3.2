ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.update_order_with_items(p_order_id uuid, p_customer_name text, p_customer_phone text, p_customer_address text, p_delivery_charge numeric, p_discount_amount numeric, p_advance_amount numeric, p_invoice_note text, p_internal_note text, p_items jsonb)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders;
  v_item jsonb;
  v_product_id uuid;
  v_variant_id uuid;
  v_quantity int;
  v_unit_price numeric;
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

  DELETE FROM public.order_items WHERE order_id = p_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_variant_id := NULLIF(v_item->>'variant_id','')::uuid;
    v_quantity := (v_item->>'quantity')::int;
    v_unit_price := COALESCE(NULLIF(v_item->>'unit_price','')::numeric, 0);

    IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = v_product_id) THEN
      RAISE EXCEPTION 'Product not found: %', v_product_id USING ERRCODE = '23503';
    END IF;
    IF v_variant_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.product_variants WHERE id = v_variant_id AND product_id = v_product_id
    ) THEN
      RAISE EXCEPTION 'Variant not found for product %', v_product_id USING ERRCODE = '23503';
    END IF;
    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'Quantity must be at least 1' USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.order_items (order_id, product_id, variant_id, quantity, unit_price)
      VALUES (p_order_id, v_product_id, v_variant_id, v_quantity, v_unit_price);

    v_subtotal := v_subtotal + (v_quantity * v_unit_price);
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
    updated_at = now(),
    updated_by = auth.uid()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$function$;