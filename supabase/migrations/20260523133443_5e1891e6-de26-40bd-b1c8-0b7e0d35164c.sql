CREATE OR REPLACE FUNCTION public.user_has_any_permission(_user_id uuid, _perms text[])
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  p text;
BEGIN
  IF _user_id IS NULL THEN
    RETURN false;
  END IF;

  IF public.has_role(_user_id, 'admin'::app_role) THEN
    RETURN true;
  END IF;

  FOREACH p IN ARRAY _perms LOOP
    IF public.user_has_permission(_user_id, p) THEN
      RETURN true;
    END IF;
  END LOOP;

  RETURN false;
END;
$$;

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
SECURITY DEFINER
SET search_path TO public
AS $$
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
  IF NOT public.user_has_permission(v_uid, 'can_manage_orders') THEN
    RAISE EXCEPTION 'You do not have permission to create orders' USING ERRCODE = '42501';
  END IF;
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
$$;

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
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
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
  IF NOT public.user_has_permission(auth.uid(), 'can_manage_orders') THEN
    RAISE EXCEPTION 'You do not have permission to edit orders' USING ERRCODE = '42501';
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
$$;

DROP POLICY IF EXISTS "staff with manage_products manage products" ON public.products;
CREATE POLICY "staff with manage_products manage products" ON public.products
  FOR ALL TO authenticated
  USING (public.user_has_permission((select auth.uid()), 'can_manage_products'))
  WITH CHECK (public.user_has_permission((select auth.uid()), 'can_manage_products'));

DROP POLICY IF EXISTS "staff with manage_products manage categories" ON public.categories;
CREATE POLICY "staff with manage_products manage categories" ON public.categories
  FOR ALL TO authenticated
  USING (public.user_has_permission((select auth.uid()), 'can_manage_products'))
  WITH CHECK (public.user_has_permission((select auth.uid()), 'can_manage_products'));

DROP POLICY IF EXISTS "staff with manage_products manage product_variants" ON public.product_variants;
CREATE POLICY "staff with manage_products manage product_variants" ON public.product_variants
  FOR ALL TO authenticated
  USING (public.user_has_permission((select auth.uid()), 'can_manage_products'))
  WITH CHECK (public.user_has_permission((select auth.uid()), 'can_manage_products'));

DROP POLICY IF EXISTS "staff with manage_products manage product_external_refs" ON public.product_external_refs;
CREATE POLICY "staff with manage_products manage product_external_refs" ON public.product_external_refs
  FOR ALL TO authenticated
  USING (public.user_has_permission((select auth.uid()), 'can_manage_products'))
  WITH CHECK (public.user_has_permission((select auth.uid()), 'can_manage_products'));

DROP POLICY IF EXISTS "staff with manage_couriers manage couriers" ON public.couriers;
CREATE POLICY "staff with manage_couriers manage couriers" ON public.couriers
  FOR ALL TO authenticated
  USING (public.user_has_permission((select auth.uid()), 'can_manage_couriers'))
  WITH CHECK (public.user_has_permission((select auth.uid()), 'can_manage_couriers'));

DROP POLICY IF EXISTS "staff with manage_orders manage order_sources" ON public.order_sources;
CREATE POLICY "staff with manage_orders manage order_sources" ON public.order_sources
  FOR ALL TO authenticated
  USING (public.user_has_permission((select auth.uid()), 'can_manage_orders'))
  WITH CHECK (public.user_has_permission((select auth.uid()), 'can_manage_orders'));

DROP POLICY IF EXISTS "staff with manage_orders manage advance_payment_sources" ON public.advance_payment_sources;
CREATE POLICY "staff with manage_orders manage advance_payment_sources" ON public.advance_payment_sources
  FOR ALL TO authenticated
  USING (public.user_has_permission((select auth.uid()), 'can_manage_orders'))
  WITH CHECK (public.user_has_permission((select auth.uid()), 'can_manage_orders'));

DROP POLICY IF EXISTS "staff with view orders can view imported_customers" ON public.imported_customers;
CREATE POLICY "staff with view orders can view imported_customers" ON public.imported_customers
  FOR SELECT TO authenticated
  USING (public.user_has_any_permission((select auth.uid()), ARRAY['can_view_orders','can_manage_orders','can_manage_telesales']));