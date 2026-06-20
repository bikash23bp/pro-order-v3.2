REVOKE EXECUTE ON FUNCTION public.get_order_customer_flags_v1(text[], text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_order_customer_flags_v1(text[], text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_order_customer_flags_v1(text[], text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_customer_flags_v1(text[], text[]) TO service_role;