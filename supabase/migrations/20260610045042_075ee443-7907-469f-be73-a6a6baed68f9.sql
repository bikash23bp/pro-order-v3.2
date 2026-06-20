DELETE FROM public.order_items WHERE order_id IN (
  SELECT id FROM public.orders
  WHERE source = 'woocommerce_incomplete' AND status = 'incomplete'
    AND (customer_phone IS NULL OR length(regexp_replace(customer_phone, '[^0-9]', '', 'g')) < 11)
);
DELETE FROM public.orders
WHERE source = 'woocommerce_incomplete' AND status = 'incomplete'
  AND (customer_phone IS NULL OR length(regexp_replace(customer_phone, '[^0-9]', '', 'g')) < 11);