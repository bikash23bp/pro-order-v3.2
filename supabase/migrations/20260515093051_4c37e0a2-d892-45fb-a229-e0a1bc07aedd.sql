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
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_order public.orders;
  v_item jsonb;
  v_product public.products;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_customer_name IS NULL OR btrim(p_customer_name) = '' THEN
    RAISE EXCEPTION 'Customer name is required';
  END IF;
  IF p_customer_phone IS NULL OR btrim(p_customer_phone) = '' THEN
    RAISE EXCEPTION 'Customer phone is required';
  END IF;
  IF p_customer_address IS NULL OR btrim(p_customer_address) = '' THEN
    RAISE EXCEPTION 'Customer address is required';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one order item is required';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_product FROM public.products WHERE id = (v_item->>'product_id')::uuid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found: %', v_item->>'product_id';
    END IF;
    IF (v_item->>'quantity')::int <= 0 THEN
      RAISE EXCEPTION 'Quantity must be at least 1 for %', v_product.name;
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
    btrim(p_customer_name), btrim(p_customer_phone), NULLIF(btrim(COALESCE(p_customer_email, '')), ''), btrim(p_customer_address),
    p_courier_id, COALESCE(p_delivery_charge,0), COALESCE(p_discount_amount,0), COALESCE(p_advance_amount,0),
    COALESCE(p_subtotal,0), COALESCE(p_total_amount,0), NULLIF(btrim(COALESCE(p_invoice_note, '')), ''), NULLIF(btrim(COALESCE(p_internal_note, '')), ''), auth.uid(), 'processing'::order_status, 'manual'
  ) RETURNING * INTO v_order;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.order_items (order_id, product_id, quantity, unit_price)
    VALUES (
      v_order.id,
      (v_item->>'product_id')::uuid,
      (v_item->>'quantity')::int,
      COALESCE((v_item->>'unit_price')::numeric, 0)
    );
  END LOOP;

  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_with_items(text,text,text,text,uuid,numeric,numeric,numeric,numeric,numeric,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_with_items(text,text,text,text,uuid,numeric,numeric,numeric,numeric,numeric,text,text,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;