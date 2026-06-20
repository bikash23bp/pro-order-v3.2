CREATE UNIQUE INDEX IF NOT EXISTS uniq_orders_invoice_number
  ON public.orders (invoice_number)
  WHERE invoice_number IS NOT NULL;
