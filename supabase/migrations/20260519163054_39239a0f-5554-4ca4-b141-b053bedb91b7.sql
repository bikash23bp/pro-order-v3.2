-- Bug A: Drop duplicate invoice number trigger (keep trg_assign_invoice_number)
DROP TRIGGER IF EXISTS orders_assign_invoice_number ON public.orders;

-- Bug B: Restore stock when an order is cancelled/returned/fraud, re-deduct if reactivated
CREATE OR REPLACE FUNCTION public.adjust_stock_on_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inactive CONSTANT text[] := ARRAY['cancelled','returned','fraud'];
  v_was_inactive boolean;
  v_is_inactive boolean;
  v_item record;
BEGIN
  v_was_inactive := OLD.status::text = ANY(v_inactive);
  v_is_inactive  := NEW.status::text = ANY(v_inactive);

  -- No change in active/inactive bucket → nothing to do.
  IF v_was_inactive = v_is_inactive THEN
    RETURN NEW;
  END IF;

  -- Active → Inactive: restore stock (add back).
  IF NOT v_was_inactive AND v_is_inactive THEN
    FOR v_item IN
      SELECT product_id, variant_id, quantity FROM public.order_items WHERE order_id = NEW.id
    LOOP
      IF v_item.variant_id IS NOT NULL THEN
        UPDATE public.product_variants
          SET stock_quantity = stock_quantity + v_item.quantity
          WHERE id = v_item.variant_id;
      ELSE
        UPDATE public.products
          SET stock_quantity = stock_quantity + v_item.quantity
          WHERE id = v_item.product_id;
      END IF;
    END LOOP;
    RETURN NEW;
  END IF;

  -- Inactive → Active: re-deduct stock.
  IF v_was_inactive AND NOT v_is_inactive THEN
    FOR v_item IN
      SELECT product_id, variant_id, quantity FROM public.order_items WHERE order_id = NEW.id
    LOOP
      IF v_item.variant_id IS NOT NULL THEN
        UPDATE public.product_variants
          SET stock_quantity = stock_quantity - v_item.quantity
          WHERE id = v_item.variant_id;
      ELSE
        UPDATE public.products
          SET stock_quantity = stock_quantity - v_item.quantity
          WHERE id = v_item.product_id;
      END IF;
    END LOOP;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger-only function: revoke broad EXECUTE.
REVOKE EXECUTE ON FUNCTION public.adjust_stock_on_order_status_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_adjust_stock_on_order_status_change ON public.orders;
CREATE TRIGGER trg_adjust_stock_on_order_status_change
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.adjust_stock_on_order_status_change();