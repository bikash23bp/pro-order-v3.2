CREATE INDEX IF NOT EXISTS idx_orders_customer_email_status
  ON public.orders (customer_email, status)
  WHERE customer_email IS NOT NULL AND btrim(customer_email) <> '';