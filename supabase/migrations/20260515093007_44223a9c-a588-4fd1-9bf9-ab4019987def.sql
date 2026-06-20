REVOKE ALL ON FUNCTION public.adjust_stock_for_order_items() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decrement_stock() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_order_with_items(text,text,text,text,uuid,numeric,numeric,numeric,numeric,numeric,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_with_items(text,text,text,text,uuid,numeric,numeric,numeric,numeric,numeric,text,text,jsonb) TO authenticated;