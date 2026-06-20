
CREATE OR REPLACE FUNCTION public.import_legacy_order(
  p_customer_name text,
  p_customer_phone text,
  p_customer_address text,
  p_customer_email text,
  p_order_date timestamptz,
  p_status order_status,
  p_subtotal numeric,
  p_delivery_charge numeric,
  p_total_amount numeric,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_item jsonb;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can import legacy orders' USING ERRCODE = '42501';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one order item is required' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.orders (
    customer_name, customer_phone, customer_email, customer_address,
    delivery_charge, discount_amount, advance_amount, subtotal, total_amount,
    status, source, created_by, created_at, updated_at, internal_note
  ) VALUES (
    btrim(p_customer_name), btrim(p_customer_phone),
    NULLIF(btrim(COALESCE(p_customer_email,'')),''),
    btrim(p_customer_address),
    COALESCE(p_delivery_charge, 0), 0, 0,
    COALESCE(p_subtotal, 0), COALESCE(p_total_amount, 0),
    COALESCE(p_status, 'completed'::order_status),
    'legacy_import', v_uid,
    COALESCE(p_order_date, now()), COALESCE(p_order_date, now()),
    '[Legacy import]'
  ) RETURNING id INTO v_order_id;

  -- Bypass stock trigger for legacy imports
  ALTER TABLE public.order_items DISABLE TRIGGER USER;
  BEGIN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
      INSERT INTO public.order_items (order_id, product_id, quantity, unit_price)
      VALUES (
        v_order_id,
        (v_item->>'product_id')::uuid,
        GREATEST(1, COALESCE((v_item->>'quantity')::int, 1)),
        COALESCE((v_item->>'unit_price')::numeric, 0)
      );
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    ALTER TABLE public.order_items ENABLE TRIGGER USER;
    RAISE;
  END;
  ALTER TABLE public.order_items ENABLE TRIGGER USER;

  RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.import_legacy_order(text,text,text,text,timestamptz,order_status,numeric,numeric,numeric,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_legacy_order(text,text,text,text,timestamptz,order_status,numeric,numeric,numeric,jsonb) TO authenticated;
