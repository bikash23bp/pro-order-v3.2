CREATE OR REPLACE FUNCTION public.create_supplier_purchase(
  p_supplier_id uuid,
  p_warehouse_id uuid,
  p_discount numeric,
  p_paid_amount numeric,
  p_items jsonb
)
RETURNS public.supplier_purchases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.create_supplier_purchase(
    p_supplier_id := p_supplier_id,
    p_warehouse_id := p_warehouse_id,
    p_purchase_date := NULL::date,
    p_discount := p_discount,
    p_paid_amount := p_paid_amount,
    p_note := NULL::text,
    p_items := p_items
  );
END;
$function$;