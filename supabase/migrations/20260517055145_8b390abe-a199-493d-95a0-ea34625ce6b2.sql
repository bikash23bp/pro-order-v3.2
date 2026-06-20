
-- 1. product_variants table
CREATE TABLE IF NOT EXISTS public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  sku text,
  price numeric,
  stock_quantity integer NOT NULL DEFAULT 0,
  image_url text,
  status public.entity_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product ON public.product_variants(product_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_variants_combo
  ON public.product_variants(product_id, attributes);

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth view product_variants" ON public.product_variants;
CREATE POLICY "auth view product_variants"
  ON public.product_variants FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admins manage product_variants" ON public.product_variants;
CREATE POLICY "admins manage product_variants"
  ON public.product_variants FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS trg_product_variants_updated_at ON public.product_variants;
CREATE TRIGGER trg_product_variants_updated_at
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. products: variant schema + flag
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS variant_attributes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS has_variants boolean NOT NULL DEFAULT false;

-- 3. order_items: variant link
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_variant ON public.order_items(variant_id);

-- 4. Stock adjust trigger — handle variant or product
CREATE OR REPLACE FUNCTION public.adjust_stock_for_order_items()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.variant_id IS NOT NULL THEN
      UPDATE public.product_variants
        SET stock_quantity = stock_quantity - NEW.quantity
        WHERE id = NEW.variant_id;
    ELSE
      UPDATE public.products
        SET stock_quantity = stock_quantity - NEW.quantity
        WHERE id = NEW.product_id;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Restore old
    IF OLD.variant_id IS NOT NULL THEN
      UPDATE public.product_variants
        SET stock_quantity = stock_quantity + OLD.quantity
        WHERE id = OLD.variant_id;
    ELSE
      UPDATE public.products
        SET stock_quantity = stock_quantity + OLD.quantity
        WHERE id = OLD.product_id;
    END IF;
    -- Apply new
    IF NEW.variant_id IS NOT NULL THEN
      UPDATE public.product_variants
        SET stock_quantity = stock_quantity - NEW.quantity
        WHERE id = NEW.variant_id;
    ELSE
      UPDATE public.products
        SET stock_quantity = stock_quantity - NEW.quantity
        WHERE id = NEW.product_id;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.variant_id IS NOT NULL THEN
      UPDATE public.product_variants
        SET stock_quantity = stock_quantity + OLD.quantity
        WHERE id = OLD.variant_id;
    ELSE
      UPDATE public.products
        SET stock_quantity = stock_quantity + OLD.quantity
        WHERE id = OLD.product_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;

-- 5. Update create_order_with_items: support variant_id, remove stock blocking
CREATE OR REPLACE FUNCTION public.create_order_with_items(p_customer_name text, p_customer_phone text, p_customer_email text, p_customer_address text, p_courier_id uuid, p_delivery_charge numeric, p_discount_amount numeric, p_advance_amount numeric, p_subtotal numeric, p_total_amount numeric, p_invoice_note text, p_internal_note text, p_items jsonb)
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
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to create an order' USING ERRCODE = '28000';
  END IF;
  IF p_customer_name IS NULL OR btrim(p_customer_name) = '' THEN
    RAISE EXCEPTION 'Customer name is required' USING ERRCODE = '23514';
  END IF;
  IF p_customer_phone IS NULL OR btrim(p_customer_phone) = '' THEN
    RAISE EXCEPTION 'Customer phone is required' USING ERRCODE = '23514';
  END IF;
  IF p_customer_address IS NULL OR btrim(p_customer_address) = '' THEN
    RAISE EXCEPTION 'Customer address is required' USING ERRCODE = '23514';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one order item is required' USING ERRCODE = '23514';
  END IF;

  -- Validate product/variant existence (no stock blocking — negative allowed)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_variant_id := NULLIF(v_item->>'variant_id','')::uuid;
    v_quantity := (v_item->>'quantity')::int;
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
  END LOOP;

  INSERT INTO public.orders (
    customer_name, customer_phone, customer_email, customer_address,
    courier_id, delivery_charge, discount_amount, advance_amount,
    subtotal, total_amount, invoice_note, internal_note,
    created_by, status, source
  ) VALUES (
    btrim(p_customer_name), btrim(p_customer_phone),
    NULLIF(btrim(COALESCE(p_customer_email, '')), ''), btrim(p_customer_address),
    p_courier_id,
    COALESCE(p_delivery_charge, 0), COALESCE(p_discount_amount, 0), COALESCE(p_advance_amount, 0),
    COALESCE(p_subtotal, 0), COALESCE(p_total_amount, 0),
    NULLIF(btrim(COALESCE(p_invoice_note, '')), ''),
    NULLIF(btrim(COALESCE(p_internal_note, '')), ''),
    v_uid, 'processing'::order_status, 'manual'
  ) RETURNING * INTO v_order;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_variant_id := NULLIF(v_item->>'variant_id','')::uuid;
    v_quantity := (v_item->>'quantity')::int;
    v_unit_price := COALESCE(NULLIF(v_item->>'unit_price','')::numeric, 0);
    INSERT INTO public.order_items (order_id, product_id, variant_id, quantity, unit_price)
      VALUES (v_order.id, v_product_id, v_variant_id, v_quantity, v_unit_price);
  END LOOP;

  RETURN v_order;
END;
$function$;

-- 6. Update update_order_with_items: support variant_id, remove stock blocking
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
    updated_at = now()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$function$;
