
-- 1. create_order_with_items: server recompute + blocked check
CREATE OR REPLACE FUNCTION public.create_order_with_items(
  p_customer_name text, p_customer_phone text, p_customer_email text, p_customer_address text,
  p_courier_id uuid, p_delivery_charge numeric, p_discount_amount numeric, p_advance_amount numeric,
  p_subtotal numeric, p_total_amount numeric, p_invoice_note text, p_internal_note text, p_items jsonb
)
RETURNS public.orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders;
  v_item jsonb;
  v_product_id uuid; v_variant_id uuid; v_quantity int; v_unit_price numeric;
  v_uid uuid := auth.uid();
  v_subtotal numeric := 0; v_total numeric;
  v_delivery numeric := COALESCE(p_delivery_charge, 0);
  v_discount numeric := COALESCE(p_discount_amount, 0);
  v_advance  numeric := COALESCE(p_advance_amount, 0);
  v_blocked record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'You must be signed in to create an order' USING ERRCODE = '28000'; END IF;
  IF p_customer_name IS NULL OR btrim(p_customer_name) = '' THEN RAISE EXCEPTION 'Customer name is required' USING ERRCODE='23514'; END IF;
  IF p_customer_phone IS NULL OR btrim(p_customer_phone) = '' THEN RAISE EXCEPTION 'Customer phone is required' USING ERRCODE='23514'; END IF;
  IF p_customer_address IS NULL OR btrim(p_customer_address) = '' THEN RAISE EXCEPTION 'Customer address is required' USING ERRCODE='23514'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'At least one order item is required' USING ERRCODE='23514'; END IF;

  SELECT * INTO v_blocked FROM public.is_phone_blocked(p_customer_phone);
  IF v_blocked.blocked THEN
    RAISE EXCEPTION 'This phone number is blocked: %', COALESCE(v_blocked.reason, 'no reason') USING ERRCODE = '42501';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_variant_id := NULLIF(v_item->>'variant_id','')::uuid;
    v_quantity   := (v_item->>'quantity')::int;
    v_unit_price := COALESCE(NULLIF(v_item->>'unit_price','')::numeric, 0);
    IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = v_product_id) THEN
      RAISE EXCEPTION 'Product not found: %', v_product_id USING ERRCODE='23503';
    END IF;
    IF v_variant_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.product_variants WHERE id = v_variant_id AND product_id = v_product_id
    ) THEN RAISE EXCEPTION 'Variant not found for product %', v_product_id USING ERRCODE='23503'; END IF;
    IF v_quantity IS NULL OR v_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be at least 1' USING ERRCODE='23514'; END IF;
    IF v_unit_price < 0 THEN RAISE EXCEPTION 'Unit price cannot be negative' USING ERRCODE='23514'; END IF;
    v_subtotal := v_subtotal + (v_quantity * v_unit_price);
  END LOOP;

  IF v_discount < 0 OR v_delivery < 0 OR v_advance < 0 THEN
    RAISE EXCEPTION 'Charges cannot be negative' USING ERRCODE='23514';
  END IF;
  IF v_discount > v_subtotal THEN v_discount := v_subtotal; END IF;
  v_total := v_subtotal + v_delivery - v_discount;

  INSERT INTO public.orders (
    customer_name, customer_phone, customer_email, customer_address,
    courier_id, delivery_charge, discount_amount, advance_amount,
    subtotal, total_amount, invoice_note, internal_note,
    created_by, status, source
  ) VALUES (
    btrim(p_customer_name), btrim(p_customer_phone),
    NULLIF(btrim(COALESCE(p_customer_email,'')),''), btrim(p_customer_address),
    p_courier_id, v_delivery, v_discount, v_advance,
    v_subtotal, v_total,
    NULLIF(btrim(COALESCE(p_invoice_note,'')),''),
    NULLIF(btrim(COALESCE(p_internal_note,'')),''),
    v_uid, 'processing'::order_status, 'manual'
  ) RETURNING * INTO v_order;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.order_items (order_id, product_id, variant_id, quantity, unit_price)
      VALUES (
        v_order.id,
        (v_item->>'product_id')::uuid,
        NULLIF(v_item->>'variant_id','')::uuid,
        (v_item->>'quantity')::int,
        COALESCE(NULLIF(v_item->>'unit_price','')::numeric, 0)
      );
  END LOOP;

  RETURN v_order;
END;
$function$;

-- 2. Stock trigger respects per-txn bypass flag
CREATE OR REPLACE FUNCTION public.adjust_stock_for_order_items()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_inactive CONSTANT text[] := ARRAY['cancelled','returned','fraud'];
  v_old_status text; v_new_status text;
BEGIN
  IF current_setting('app.skip_stock_triggers', true) = '1' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT status::text INTO v_new_status FROM public.orders WHERE id = NEW.order_id;
    IF v_new_status = ANY(v_inactive) THEN RETURN NEW; END IF;
    IF NEW.variant_id IS NOT NULL THEN
      UPDATE public.product_variants SET stock_quantity = stock_quantity - NEW.quantity WHERE id = NEW.variant_id;
    ELSE
      UPDATE public.products SET stock_quantity = stock_quantity - NEW.quantity WHERE id = NEW.product_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    SELECT status::text INTO v_new_status FROM public.orders WHERE id = NEW.order_id;
    IF v_new_status = ANY(v_inactive) THEN RETURN NEW; END IF;
    IF OLD.variant_id IS NOT NULL THEN
      UPDATE public.product_variants SET stock_quantity = stock_quantity + OLD.quantity WHERE id = OLD.variant_id;
    ELSE
      UPDATE public.products SET stock_quantity = stock_quantity + OLD.quantity WHERE id = OLD.product_id;
    END IF;
    IF NEW.variant_id IS NOT NULL THEN
      UPDATE public.product_variants SET stock_quantity = stock_quantity - NEW.quantity WHERE id = NEW.variant_id;
    ELSE
      UPDATE public.products SET stock_quantity = stock_quantity - NEW.quantity WHERE id = NEW.product_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT status::text INTO v_old_status FROM public.orders WHERE id = OLD.order_id;
    IF v_old_status = ANY(v_inactive) THEN RETURN OLD; END IF;
    IF OLD.variant_id IS NOT NULL THEN
      UPDATE public.product_variants SET stock_quantity = stock_quantity + OLD.quantity WHERE id = OLD.variant_id;
    ELSE
      UPDATE public.products SET stock_quantity = stock_quantity + OLD.quantity WHERE id = OLD.product_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.import_legacy_order(
  p_customer_name text, p_customer_phone text, p_customer_address text, p_customer_email text,
  p_order_date timestamp with time zone, p_status order_status,
  p_subtotal numeric, p_delivery_charge numeric, p_total_amount numeric, p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id uuid; v_item jsonb; v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'You must be signed in' USING ERRCODE='28000'; END IF;
  IF NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can import legacy orders' USING ERRCODE='42501';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one order item is required' USING ERRCODE='23514';
  END IF;

  INSERT INTO public.orders (
    customer_name, customer_phone, customer_email, customer_address,
    delivery_charge, discount_amount, advance_amount, subtotal, total_amount,
    status, source, created_by, created_at, updated_at, internal_note
  ) VALUES (
    btrim(p_customer_name), btrim(p_customer_phone),
    NULLIF(btrim(COALESCE(p_customer_email,'')),''), btrim(p_customer_address),
    COALESCE(p_delivery_charge,0), 0, 0,
    COALESCE(p_subtotal,0), COALESCE(p_total_amount,0),
    COALESCE(p_status,'completed'::order_status),
    'legacy_import', v_uid,
    COALESCE(p_order_date, now()), COALESCE(p_order_date, now()),
    '[Legacy import]'
  ) RETURNING id INTO v_order_id;

  PERFORM set_config('app.skip_stock_triggers', '1', true);

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.order_items (order_id, product_id, quantity, unit_price)
    VALUES (
      v_order_id,
      (v_item->>'product_id')::uuid,
      GREATEST(1, COALESCE((v_item->>'quantity')::int, 1)),
      COALESCE((v_item->>'unit_price')::numeric, 0)
    );
  END LOOP;

  PERFORM set_config('app.skip_stock_triggers', '0', true);
  RETURN v_order_id;
END;
$function$;

-- 4. Woo→OMS status sync via new optional param
CREATE OR REPLACE FUNCTION public.upsert_woo_order_with_items(
  p_external_id text, p_source_site_id uuid,
  p_customer_name text, p_customer_phone text, p_customer_email text, p_customer_address text,
  p_subtotal numeric, p_total numeric, p_discount numeric, p_delivery numeric,
  p_invoice_note text, p_internal_note_create text, p_internal_note_update text,
  p_order_source_id uuid, p_items jsonb,
  p_status order_status DEFAULT 'processing'::order_status
)
RETURNS TABLE(order_id uuid, action text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_existing public.orders; v_order_id uuid; v_action text; v_item jsonb;
  v_terminal CONSTANT text[] := ARRAY['completed','cancelled','returned','fraud'];
  v_new_status order_status;
BEGIN
  SELECT * INTO v_existing
    FROM public.orders
   WHERE source = 'woocommerce' AND external_order_id = p_external_id
   FOR UPDATE;

  IF FOUND THEN
    IF v_existing.status::text = ANY(v_terminal) THEN
      v_new_status := v_existing.status;
    ELSE
      v_new_status := COALESCE(p_status, v_existing.status);
    END IF;
    UPDATE public.orders SET
      customer_name=p_customer_name, customer_phone=p_customer_phone,
      customer_email=p_customer_email, customer_address=p_customer_address,
      subtotal=p_subtotal, total_amount=p_total,
      discount_amount=p_discount, delivery_charge=p_delivery,
      invoice_note=p_invoice_note, internal_note=p_internal_note_update,
      source_site_id=p_source_site_id, status=v_new_status, updated_at=now()
    WHERE id = v_existing.id;
    DELETE FROM public.order_items WHERE order_id = v_existing.id;
    v_order_id := v_existing.id; v_action := 'updated';
  ELSE
    INSERT INTO public.orders (
      customer_name, customer_phone, customer_email, customer_address,
      subtotal, total_amount, discount_amount, delivery_charge, advance_amount,
      invoice_note, internal_note, status, source, source_site_id,
      external_order_id, order_source_id
    ) VALUES (
      p_customer_name, p_customer_phone, p_customer_email, p_customer_address,
      p_subtotal, p_total, p_discount, p_delivery, 0,
      p_invoice_note, p_internal_note_create,
      COALESCE(p_status,'processing'::order_status),
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
END $function$;
