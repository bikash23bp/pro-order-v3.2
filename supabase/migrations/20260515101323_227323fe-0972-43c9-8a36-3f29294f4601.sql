
REVOKE ALL ON FUNCTION public.bulk_update_order_status(uuid[], order_status) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_order_with_items(uuid, text, text, text, numeric, numeric, numeric, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_update_order_status(uuid[], order_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_order_with_items(uuid, text, text, text, numeric, numeric, numeric, text, text, jsonb) TO authenticated;
