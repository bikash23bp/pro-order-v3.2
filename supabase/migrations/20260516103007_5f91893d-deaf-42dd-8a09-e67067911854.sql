-- Add template + invoice numbering settings
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS active_invoice_template text NOT NULL DEFAULT 'invoice-a4-standard',
  ADD COLUMN IF NOT EXISTS active_sticker_template text NOT NULL DEFAULT 'sticker-4x3-standard',
  ADD COLUMN IF NOT EXISTS invoice_year integer NOT NULL DEFAULT EXTRACT(YEAR FROM now())::int,
  ADD COLUMN IF NOT EXISTS invoice_seq integer NOT NULL DEFAULT 0;

-- Add invoice_number to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS invoice_number text UNIQUE;

-- Trigger function: assign sequential invoice numbers atomically
CREATE OR REPLACE FUNCTION public.assign_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year int := EXTRACT(YEAR FROM now())::int;
  v_seq int;
  v_current_year int;
BEGIN
  IF NEW.invoice_number IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Lock the single settings row
  SELECT invoice_year, invoice_seq INTO v_current_year, v_seq
    FROM public.app_settings WHERE id = true FOR UPDATE;

  IF v_current_year IS NULL THEN
    INSERT INTO public.app_settings (id, invoice_year, invoice_seq)
      VALUES (true, v_year, 0)
      ON CONFLICT (id) DO NOTHING;
    SELECT invoice_year, invoice_seq INTO v_current_year, v_seq
      FROM public.app_settings WHERE id = true FOR UPDATE;
  END IF;

  IF v_current_year <> v_year THEN
    v_seq := 0;
    v_current_year := v_year;
  END IF;

  v_seq := v_seq + 1;

  UPDATE public.app_settings
    SET invoice_year = v_current_year, invoice_seq = v_seq, updated_at = now()
    WHERE id = true;

  NEW.invoice_number := 'INV-' || v_current_year::text || '-' || LPAD(v_seq::text, 5, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_invoice_number ON public.orders;
CREATE TRIGGER trg_assign_invoice_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_invoice_number();

-- Backfill existing rows
DO $$
DECLARE
  r record;
  v_year int;
  v_seq int := 0;
  v_last_year int := 0;
BEGIN
  FOR r IN SELECT id, created_at FROM public.orders WHERE invoice_number IS NULL ORDER BY order_number ASC LOOP
    v_year := EXTRACT(YEAR FROM r.created_at)::int;
    IF v_year <> v_last_year THEN
      v_seq := 0;
      v_last_year := v_year;
    END IF;
    v_seq := v_seq + 1;
    UPDATE public.orders SET invoice_number = 'INV-' || v_year::text || '-' || LPAD(v_seq::text, 5, '0') WHERE id = r.id;
  END LOOP;

  -- Sync app_settings to the latest assigned sequence in current year
  UPDATE public.app_settings
    SET invoice_year = EXTRACT(YEAR FROM now())::int,
        invoice_seq = COALESCE((
          SELECT MAX((regexp_replace(invoice_number, '^INV-\d{4}-', ''))::int)
          FROM public.orders
          WHERE invoice_number LIKE 'INV-' || EXTRACT(YEAR FROM now())::int || '-%'
        ), 0)
    WHERE id = true;
END $$;