
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS invoice_prefix text NOT NULL DEFAULT 'INV-',
  ADD COLUMN IF NOT EXISTS invoice_suffix text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS invoice_include_year boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS invoice_pad_length int NOT NULL DEFAULT 5;

CREATE OR REPLACE FUNCTION public.assign_invoice_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_year int := EXTRACT(YEAR FROM now())::int;
  v_seq int;
  v_current_year int;
  v_prefix text;
  v_suffix text;
  v_include_year boolean;
  v_pad int;
  v_year_segment text;
BEGIN
  IF NEW.invoice_number IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.app_settings (id, invoice_year, invoice_seq)
    VALUES (true, v_year, 0)
    ON CONFLICT (id) DO NOTHING;

  SELECT invoice_year, invoice_seq,
         COALESCE(invoice_prefix,'INV-'),
         COALESCE(invoice_suffix,''),
         COALESCE(invoice_include_year,true),
         GREATEST(COALESCE(invoice_pad_length,5),1)
    INTO v_current_year, v_seq, v_prefix, v_suffix, v_include_year, v_pad
    FROM public.app_settings WHERE id = true FOR UPDATE;

  IF v_current_year IS NULL OR v_current_year <> v_year THEN
    v_seq := 0;
    v_current_year := v_year;
  END IF;

  v_seq := v_seq + 1;

  UPDATE public.app_settings
    SET invoice_year = v_current_year, invoice_seq = v_seq, updated_at = now()
    WHERE id = true;

  v_year_segment := CASE WHEN v_include_year THEN v_current_year::text || '-' ELSE '' END;
  NEW.invoice_number := v_prefix || v_year_segment || LPAD(v_seq::text, v_pad, '0') || v_suffix;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS orders_assign_invoice_number ON public.orders;
CREATE TRIGGER orders_assign_invoice_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_invoice_number();

-- Backfill existing orders that don't have an invoice number
DO $$
DECLARE
  r record;
  v_year int;
  v_seq int;
  v_prefix text;
  v_suffix text;
  v_include_year boolean;
  v_pad int;
  v_year_segment text;
BEGIN
  INSERT INTO public.app_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

  SELECT COALESCE(invoice_prefix,'INV-'),
         COALESCE(invoice_suffix,''),
         COALESCE(invoice_include_year,true),
         GREATEST(COALESCE(invoice_pad_length,5),1),
         COALESCE(invoice_seq,0),
         COALESCE(invoice_year, EXTRACT(YEAR FROM now())::int)
    INTO v_prefix, v_suffix, v_include_year, v_pad, v_seq, v_year
    FROM public.app_settings WHERE id = true FOR UPDATE;

  FOR r IN
    SELECT id, created_at FROM public.orders
    WHERE invoice_number IS NULL
    ORDER BY created_at ASC, order_number ASC
  LOOP
    DECLARE
      r_year int := EXTRACT(YEAR FROM r.created_at)::int;
    BEGIN
      IF r_year <> v_year THEN
        v_year := r_year;
        v_seq := 0;
      END IF;
      v_seq := v_seq + 1;
      v_year_segment := CASE WHEN v_include_year THEN v_year::text || '-' ELSE '' END;
      UPDATE public.orders
        SET invoice_number = v_prefix || v_year_segment || LPAD(v_seq::text, v_pad, '0') || v_suffix
        WHERE id = r.id;
    END;
  END LOOP;

  UPDATE public.app_settings
    SET invoice_year = v_year, invoice_seq = v_seq, updated_at = now()
    WHERE id = true;
END $$;
