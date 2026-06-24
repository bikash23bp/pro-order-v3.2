REVOKE ALL ON FUNCTION public.assign_unique_order_number() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_unique_order_number() FROM anon;
REVOKE ALL ON FUNCTION public.assign_unique_order_number() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.assign_unique_order_number() TO service_role;