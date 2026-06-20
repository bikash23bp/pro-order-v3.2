
-- Low stock threshold on products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS low_stock_threshold integer NOT NULL DEFAULT 5;

-- Warehouses
CREATE TABLE IF NOT EXISTS public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location text,
  status entity_status NOT NULL DEFAULT 'active',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth view warehouses" ON public.warehouses FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage warehouses" ON public.warehouses FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "staff manage_orders insert warehouses" ON public.warehouses FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR EXISTS (SELECT 1 FROM public.user_permissions up WHERE up.user_id = auth.uid() AND up.can_manage_orders));

CREATE TRIGGER trg_warehouses_updated BEFORE UPDATE ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.warehouses (name, location, is_default) VALUES ('Main Warehouse', 'Default location', true)
ON CONFLICT DO NOTHING;

-- Suppliers
CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  email text,
  address text,
  contact_person text,
  opening_balance numeric NOT NULL DEFAULT 0,
  status entity_status NOT NULL DEFAULT 'active',
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth view suppliers" ON public.suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage suppliers" ON public.suppliers FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "staff manage_orders manage suppliers" ON public.suppliers FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR EXISTS (SELECT 1 FROM public.user_permissions up WHERE up.user_id = auth.uid() AND up.can_manage_orders));
CREATE POLICY "staff manage_orders update suppliers" ON public.suppliers FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR EXISTS (SELECT 1 FROM public.user_permissions up WHERE up.user_id = auth.uid() AND up.can_manage_orders));

CREATE TRIGGER trg_suppliers_updated BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Inventory transactions
CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  variant_id uuid,
  warehouse_id uuid,
  type text NOT NULL CHECK (type IN ('purchase','sale','return_in','return_out','adjustment')),
  quantity integer NOT NULL,
  unit_cost numeric NOT NULL DEFAULT 0,
  reference_type text,
  reference_id uuid,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inv_tx_product ON public.inventory_transactions(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_created ON public.inventory_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_tx_type ON public.inventory_transactions(type);

ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth view inventory_transactions" ON public.inventory_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert inventory_transactions" ON public.inventory_transactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "admins delete inventory_transactions" ON public.inventory_transactions FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role));

-- Supplier purchases
CREATE SEQUENCE IF NOT EXISTS supplier_purchase_seq;

CREATE TABLE IF NOT EXISTS public.supplier_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_number text UNIQUE,
  supplier_id uuid NOT NULL,
  warehouse_id uuid,
  purchase_date date NOT NULL DEFAULT CURRENT_DATE,
  subtotal numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  paid_amount numeric NOT NULL DEFAULT 0,
  due_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'received',
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON public.supplier_purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON public.supplier_purchases(purchase_date DESC);

ALTER TABLE public.supplier_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth view supplier_purchases" ON public.supplier_purchases FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert supplier_purchases" ON public.supplier_purchases FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "admins manage supplier_purchases" ON public.supplier_purchases FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER trg_supplier_purchases_updated BEFORE UPDATE ON public.supplier_purchases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto purchase number
CREATE OR REPLACE FUNCTION public.assign_purchase_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.purchase_number IS NULL THEN
    NEW.purchase_number := 'PUR-' || EXTRACT(YEAR FROM now())::text || '-' ||
      LPAD(nextval('supplier_purchase_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_supplier_purchases_number BEFORE INSERT ON public.supplier_purchases
  FOR EACH ROW EXECUTE FUNCTION public.assign_purchase_number();

-- Purchase items
CREATE TABLE IF NOT EXISTS public.supplier_purchase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL,
  product_id uuid NOT NULL,
  variant_id uuid,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_cost numeric NOT NULL DEFAULT 0,
  total_cost numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON public.supplier_purchase_items(purchase_id);

ALTER TABLE public.supplier_purchase_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth view purchase_items" ON public.supplier_purchase_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert purchase_items" ON public.supplier_purchase_items FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "admins manage purchase_items" ON public.supplier_purchase_items FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));

-- Trigger: purchase item -> stock + inventory_transactions
CREATE OR REPLACE FUNCTION public.purchase_item_stock_in()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_wh uuid;
BEGIN
  SELECT warehouse_id INTO v_wh FROM public.supplier_purchases WHERE id = NEW.purchase_id;
  IF NEW.variant_id IS NOT NULL THEN
    UPDATE public.product_variants SET stock_quantity = stock_quantity + NEW.quantity WHERE id = NEW.variant_id;
  ELSE
    UPDATE public.products SET stock_quantity = stock_quantity + NEW.quantity WHERE id = NEW.product_id;
  END IF;
  INSERT INTO public.inventory_transactions(product_id, variant_id, warehouse_id, type, quantity, unit_cost, reference_type, reference_id)
  VALUES (NEW.product_id, NEW.variant_id, v_wh, 'purchase', NEW.quantity, NEW.unit_cost, 'supplier_purchase', NEW.purchase_id);
  RETURN NEW;
END $$;

CREATE TRIGGER trg_purchase_item_stock_in AFTER INSERT ON public.supplier_purchase_items
  FOR EACH ROW EXECUTE FUNCTION public.purchase_item_stock_in();

-- Supplier payments
CREATE TABLE IF NOT EXISTS public.supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL,
  purchase_id uuid,
  amount numeric NOT NULL CHECK (amount > 0),
  paid_on date NOT NULL DEFAULT CURRENT_DATE,
  method text,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON public.supplier_payments(supplier_id);

ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth view supplier_payments" ON public.supplier_payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert supplier_payments" ON public.supplier_payments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "admins manage supplier_payments" ON public.supplier_payments FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));

-- Supplier returns
CREATE TABLE IF NOT EXISTS public.supplier_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL,
  purchase_id uuid,
  product_id uuid NOT NULL,
  variant_id uuid,
  warehouse_id uuid,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_cost numeric NOT NULL DEFAULT 0,
  reason text,
  return_date date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_supplier_returns_supplier ON public.supplier_returns(supplier_id);

ALTER TABLE public.supplier_returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth view supplier_returns" ON public.supplier_returns FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert supplier_returns" ON public.supplier_returns FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "admins manage supplier_returns" ON public.supplier_returns FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));

-- Trigger: supplier return -> stock out + inventory_transactions
CREATE OR REPLACE FUNCTION public.supplier_return_stock_out()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.variant_id IS NOT NULL THEN
    UPDATE public.product_variants SET stock_quantity = stock_quantity - NEW.quantity WHERE id = NEW.variant_id;
  ELSE
    UPDATE public.products SET stock_quantity = stock_quantity - NEW.quantity WHERE id = NEW.product_id;
  END IF;
  INSERT INTO public.inventory_transactions(product_id, variant_id, warehouse_id, type, quantity, unit_cost, reference_type, reference_id, note)
  VALUES (NEW.product_id, NEW.variant_id, NEW.warehouse_id, 'return_out', -NEW.quantity, NEW.unit_cost, 'supplier_return', NEW.id, NEW.reason);
  RETURN NEW;
END $$;

CREATE TRIGGER trg_supplier_return_stock_out AFTER INSERT ON public.supplier_returns
  FOR EACH ROW EXECUTE FUNCTION public.supplier_return_stock_out();

-- Trigger: order item -> log sale in inventory_transactions
CREATE OR REPLACE FUNCTION public.order_item_log_sale()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_cost numeric := 0;
BEGIN
  IF NEW.variant_id IS NOT NULL THEN
    SELECT COALESCE(cost_price,0) INTO v_cost FROM public.product_variants WHERE id = NEW.variant_id;
  ELSE
    SELECT COALESCE(cost_price,0) INTO v_cost FROM public.products WHERE id = NEW.product_id;
  END IF;
  INSERT INTO public.inventory_transactions(product_id, variant_id, type, quantity, unit_cost, reference_type, reference_id)
  VALUES (NEW.product_id, NEW.variant_id, 'sale', -NEW.quantity, v_cost, 'order', NEW.order_id);
  RETURN NEW;
END $$;

CREATE TRIGGER trg_order_item_log_sale AFTER INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.order_item_log_sale();

-- RPC: create purchase with items
CREATE OR REPLACE FUNCTION public.create_supplier_purchase(
  p_supplier_id uuid, p_warehouse_id uuid, p_purchase_date date,
  p_discount numeric, p_paid_amount numeric, p_note text, p_items jsonb
) RETURNS public.supplier_purchases
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_purchase public.supplier_purchases;
  v_item jsonb;
  v_subtotal numeric := 0;
  v_qty int; v_cost numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE = '28000'; END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one item required' USING ERRCODE = '23514';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::int;
    v_cost := COALESCE((v_item->>'unit_cost')::numeric, 0);
    v_subtotal := v_subtotal + (v_qty * v_cost);
  END LOOP;

  INSERT INTO public.supplier_purchases(
    supplier_id, warehouse_id, purchase_date, subtotal, discount,
    total_amount, paid_amount, due_amount, note, created_by
  ) VALUES (
    p_supplier_id, p_warehouse_id, COALESCE(p_purchase_date, CURRENT_DATE),
    v_subtotal, COALESCE(p_discount,0),
    v_subtotal - COALESCE(p_discount,0),
    COALESCE(p_paid_amount,0),
    v_subtotal - COALESCE(p_discount,0) - COALESCE(p_paid_amount,0),
    NULLIF(btrim(COALESCE(p_note,'')), ''),
    auth.uid()
  ) RETURNING * INTO v_purchase;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::int;
    v_cost := COALESCE((v_item->>'unit_cost')::numeric, 0);
    INSERT INTO public.supplier_purchase_items(purchase_id, product_id, variant_id, quantity, unit_cost, total_cost)
    VALUES (v_purchase.id, (v_item->>'product_id')::uuid, NULLIF(v_item->>'variant_id','')::uuid, v_qty, v_cost, v_qty * v_cost);
  END LOOP;

  -- Record initial payment if any
  IF COALESCE(p_paid_amount,0) > 0 THEN
    INSERT INTO public.supplier_payments(supplier_id, purchase_id, amount, paid_on, method, created_by)
    VALUES (p_supplier_id, v_purchase.id, p_paid_amount, COALESCE(p_purchase_date, CURRENT_DATE), 'cash', auth.uid());
  END IF;

  RETURN v_purchase;
END $$;
