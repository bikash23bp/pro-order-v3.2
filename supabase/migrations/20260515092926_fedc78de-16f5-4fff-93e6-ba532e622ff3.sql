-- Ensure stock changes are adjusted correctly for order item inserts, updates, and deletes
CREATE OR REPLACE FUNCTION public.adjust_stock_for_order_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.products
    SET stock_quantity = stock_quantity - NEW.quantity
    WHERE id = NEW.product_id;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.product_id = NEW.product_id THEN
      UPDATE public.products
      SET stock_quantity = stock_quantity + OLD.quantity - NEW.quantity
      WHERE id = NEW.product_id;
    ELSE
      UPDATE public.products
      SET stock_quantity = stock_quantity + OLD.quantity
      WHERE id = OLD.product_id;

      UPDATE public.products
      SET stock_quantity = stock_quantity - NEW.quantity
      WHERE id = NEW.product_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.products
    SET stock_quantity = stock_quantity + OLD.quantity
    WHERE id = OLD.product_id;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_decrement_stock ON public.order_items;
CREATE TRIGGER trg_adjust_stock_order_items
AFTER INSERT OR UPDATE OR DELETE ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.adjust_stock_for_order_items();

-- Keep the old function name compatible in case anything else references it
CREATE OR REPLACE FUNCTION public.decrement_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.products
  SET stock_quantity = stock_quantity - NEW.quantity
  WHERE id = NEW.product_id;
  RETURN NEW;
END;
$$;

-- One local product should only appear once per order after WooCommerce line aggregation
CREATE UNIQUE INDEX IF NOT EXISTS order_items_order_product_key
ON public.order_items (order_id, product_id);

-- Enable realtime order list refreshes
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;