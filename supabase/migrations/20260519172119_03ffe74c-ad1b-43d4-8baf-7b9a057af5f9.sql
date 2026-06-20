-- 1) Atomic upsert of Woo order + items in a single transaction.
--    Either everything commits, or nothing changes. WooCommerce 5xx-retries
--    will then re-apply cleanly without leaving partial state.
CREATE OR REPLACE FUNCTION public.upsert_woo_order_with_items(
  p_external_id text,
  p_source_site_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_customer_address text,
  p_subtotal numeric,
  p_total numeric,
  p_discount numeric,
  p_delivery numeric,
  p_invoice_note text,
  p_internal_note_create text,
  p_internal_note_update text,
  p_order_source_id uuid,
  p_items jsonb
) RETURNS TABLE(order_id uuid, action text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.orders;
  v_order_id uuid;
  v_action text;
  v_item jsonb;
BEGIN
  -- Lock the existing row (if any) for the rest of the txn.
  SELECT * INTO v_existing
    FROM public.orders
   WHERE source = 'woocommerce' AND external_order_id = p_external_id
   FOR UPDATE;

  IF FOUND THEN
    UPDATE public.orders SET
      customer_name    = p_customer_name,
      customer_phone   = p_customer_phone,
      customer_email   = p_customer_email,
      customer_address = p_customer_address,
      subtotal         = p_subtotal,
      total_amount     = p_total,
      discount_amount  = p_discount,
      delivery_charge  = p_delivery,
      invoice_note     = p_invoice_note,
      internal_note    = p_internal_note_update,
      source_site_id   = p_source_site_id,
      updated_at       = now()
    WHERE id = v_existing.id;

    DELETE FROM public.order_items WHERE order_id = v_existing.id;
    v_order_id := v_existing.id;
    v_action   := 'updated';
  ELSE
    INSERT INTO public.orders (
      customer_name, customer_phone, customer_email, customer_address,
      subtotal, total_amount, discount_amount, delivery_charge, advance_amount,
      invoice_note, internal_note, status, source, source_site_id,
      external_order_id, order_source_id
    ) VALUES (
      p_customer_name, p_customer_phone, p_customer_email, p_customer_address,
      p_subtotal, p_total, p_discount, p_delivery, 0,
      p_invoice_note, p_internal_note_create, 'processing'::order_status,
      'woocommerce', p_source_site_id, p_external_id, p_order_source_id
    ) RETURNING id INTO v_order_id;
    v_action := 'created';
  END IF;

  IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
      INSERT INTO public.order_items (order_id, product_id, variant_id, quantity, unit_price)
      VALUES (
        v_order_id,
        (v_item->>'product_id')::uuid,
        NULLIF(v_item->>'variant_id','')::uuid,
        GREATEST(1, COALESCE((v_item->>'quantity')::int, 1)),
        COALESCE((v_item->>'unit_price')::numeric, 0)
      );
    END LOOP;
  END IF;

  RETURN QUERY SELECT v_order_id, v_action;
END $$;

-- Restrict to service role / admin (no public exec)
REVOKE EXECUTE ON FUNCTION public.upsert_woo_order_with_items(
  text, uuid, text, text, text, text, numeric, numeric, numeric, numeric,
  text, text, text, uuid, jsonb
) FROM PUBLIC, anon, authenticated;
