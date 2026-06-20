-- Fix A: Stock trigger must skip orders whose status already restored stock.
-- Otherwise webhook re-sync (DELETE+INSERT order_items) on cancelled/returned/fraud
-- orders double-adjusts stock.
CREATE OR REPLACE FUNCTION public.adjust_stock_for_order_items()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inactive CONSTANT text[] := ARRAY['cancelled','returned','fraud'];
  v_old_status text;
  v_new_status text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT status::text INTO v_new_status FROM public.orders WHERE id = NEW.order_id;
    IF v_new_status = ANY(v_inactive) THEN
      RETURN NEW; -- inactive order: do not deduct
    END IF;
    IF NEW.variant_id IS NOT NULL THEN
      UPDATE public.product_variants SET stock_quantity = stock_quantity - NEW.quantity WHERE id = NEW.variant_id;
    ELSE
      UPDATE public.products SET stock_quantity = stock_quantity - NEW.quantity WHERE id = NEW.product_id;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    SELECT status::text INTO v_new_status FROM public.orders WHERE id = NEW.order_id;
    IF v_new_status = ANY(v_inactive) THEN
      RETURN NEW; -- inactive: stock untouched
    END IF;
    -- Restore old
    IF OLD.variant_id IS NOT NULL THEN
      UPDATE public.product_variants SET stock_quantity = stock_quantity + OLD.quantity WHERE id = OLD.variant_id;
    ELSE
      UPDATE public.products SET stock_quantity = stock_quantity + OLD.quantity WHERE id = OLD.product_id;
    END IF;
    -- Apply new
    IF NEW.variant_id IS NOT NULL THEN
      UPDATE public.product_variants SET stock_quantity = stock_quantity - NEW.quantity WHERE id = NEW.variant_id;
    ELSE
      UPDATE public.products SET stock_quantity = stock_quantity - NEW.quantity WHERE id = NEW.product_id;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    SELECT status::text INTO v_old_status FROM public.orders WHERE id = OLD.order_id;
    IF v_old_status = ANY(v_inactive) THEN
      RETURN OLD; -- inactive: stock already restored by status trigger
    END IF;
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

-- Fix B: prevent duplicate orders from concurrent webhook deliveries.
CREATE UNIQUE INDEX IF NOT EXISTS orders_source_external_id_uniq
  ON public.orders (source, external_order_id)
  WHERE external_order_id IS NOT NULL;