
CREATE OR REPLACE FUNCTION public.import_legacy_orders_batch(p_orders jsonb)
RETURNS TABLE(inserted int, failed int, errors jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_order jsonb;
  v_item jsonb;
  v_cf jsonb;
  v_order_id uuid;
  v_idx int := -1;
  v_inserted int := 0;
  v_failed int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_status order_status;
  v_subtotal numeric;
  v_total numeric;
  v_delivery numeric;
  v_order_date timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'You must be signed in' USING ERRCODE='28000'; END IF;
  IF NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can import legacy orders' USING ERRCODE='42501';
  END IF;
  IF p_orders IS NULL OR jsonb_typeof(p_orders) <> 'array' THEN
    RAISE EXCEPTION 'orders must be a JSON array' USING ERRCODE='22023';
  END IF;

  PERFORM set_config('app.skip_stock_triggers', '1', true);

  FOR v_order IN SELECT * FROM jsonb_array_elements(p_orders) LOOP
    v_idx := v_idx + 1;
    BEGIN
      IF (v_order->'items') IS NULL OR jsonb_typeof(v_order->'items') <> 'array'
         OR jsonb_array_length(v_order->'items') = 0 THEN
        RAISE EXCEPTION 'At least one order item is required';
      END IF;

      v_delivery := COALESCE((v_order->>'delivery_charge')::numeric, 0);
      v_subtotal := 0;
      FOR v_item IN SELECT * FROM jsonb_array_elements(v_order->'items') LOOP
        v_subtotal := v_subtotal
          + GREATEST(1, COALESCE((v_item->>'quantity')::int, 1))
          * COALESCE((v_item->>'unit_price')::numeric, 0);
      END LOOP;
      v_total := v_subtotal + v_delivery;

      BEGIN
        v_status := COALESCE(NULLIF(v_order->>'status','')::order_status, 'completed'::order_status);
      EXCEPTION WHEN others THEN
        v_status := 'completed'::order_status;
      END;

      BEGIN
        v_order_date := COALESCE((v_order->>'order_date')::timestamptz, now());
      EXCEPTION WHEN others THEN
        v_order_date := now();
      END;

      INSERT INTO public.orders (
        customer_name, customer_phone, customer_email, customer_address,
        delivery_charge, discount_amount, advance_amount, subtotal, total_amount,
        status, source, created_by, created_at, updated_at, internal_note,
        consignment_id, invoice_number, invoice_note
      ) VALUES (
        btrim(COALESCE(v_order->>'customer_name','Unknown')),
        btrim(COALESCE(v_order->>'customer_phone','N/A')),
        NULLIF(btrim(COALESCE(v_order->>'customer_email','')),''),
        btrim(COALESCE(v_order->>'customer_address','N/A')),
        v_delivery, 0, 0, v_subtotal, v_total,
        v_status, 'legacy_import', v_uid,
        v_order_date, v_order_date,
        '[Legacy import]',
        NULLIF(btrim(COALESCE(v_order->>'tracking_id','')),''),
        NULLIF(btrim(COALESCE(v_order->>'invoice_number','')),''),
        NULLIF(btrim(COALESCE(v_order->>'note','')),'')
      ) RETURNING id INTO v_order_id;

      FOR v_item IN SELECT * FROM jsonb_array_elements(v_order->'items') LOOP
        INSERT INTO public.order_items (order_id, product_id, quantity, unit_price)
        VALUES (
          v_order_id,
          (v_item->>'product_id')::uuid,
          GREATEST(1, COALESCE((v_item->>'quantity')::int, 1)),
          COALESCE((v_item->>'unit_price')::numeric, 0)
        );
      END LOOP;

      IF (v_order->'custom_fields') IS NOT NULL
         AND jsonb_typeof(v_order->'custom_fields') = 'array' THEN
        FOR v_cf IN SELECT * FROM jsonb_array_elements(v_order->'custom_fields') LOOP
          IF COALESCE(btrim(v_cf->>'key'),'') <> '' THEN
            INSERT INTO public.order_custom_fields (order_id, key, value)
            VALUES (v_order_id, btrim(v_cf->>'key'), COALESCE(v_cf->>'value',''));
          END IF;
        END LOOP;
      END IF;

      v_inserted := v_inserted + 1;
    EXCEPTION WHEN others THEN
      v_failed := v_failed + 1;
      v_errors := v_errors || jsonb_build_object('index', v_idx, 'message', SQLERRM);
    END;
  END LOOP;

  PERFORM set_config('app.skip_stock_triggers', '0', true);
  RETURN QUERY SELECT v_inserted, v_failed, v_errors;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.import_legacy_orders_batch(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_legacy_orders_batch(jsonb) TO authenticated;
