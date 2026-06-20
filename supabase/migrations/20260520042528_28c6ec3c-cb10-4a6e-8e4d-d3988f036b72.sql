create or replace function public.get_reports_bundle(
  p_from timestamptz,
  p_to timestamptz,
  p_from_date date,
  p_to_date date,
  p_source uuid default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  revenue_statuses text[] := array['processing','ready_to_ship','shipped','completed'];
  v_rdc numeric := 0;
  v_rpc numeric := 0;
  v_rcc numeric := 0;
  v_order_count int := 0;
  v_revenue_order_count int := 0;
  v_returned_count int := 0;
  v_order_value_total numeric := 0;
  v_revenue numeric := 0;
  v_product_cost numeric := 0;
  v_manual_expense numeric := 0;
  v_ad_cost numeric := 0;
  v_status_breakdown jsonb;
  v_income_vs_expense jsonb;
  v_staff jsonb;
  v_top_products jsonb;
  v_returned_orders jsonb;
  v_user_stats jsonb;
begin
  select coalesce(return_delivery_charge,0),
         coalesce(return_packing_cost,0),
         coalesce(report_courier_charge,0)
    into v_rdc, v_rpc, v_rcc
    from app_settings where id = true;

  select
    count(*),
    count(*) filter (where status::text = any(revenue_statuses)),
    count(*) filter (where status::text = 'returned'),
    coalesce(sum(total_amount),0),
    coalesce(sum(total_amount) filter (where status::text = any(revenue_statuses)),0)
  into v_order_count, v_revenue_order_count, v_returned_count, v_order_value_total, v_revenue
  from orders
  where created_at >= p_from and created_at <= p_to
    and (p_source is null or order_source_id = p_source);

  select coalesce(sum(oi.quantity * coalesce(p.cost_price,0)),0)
  into v_product_cost
  from order_items oi
  join orders o on o.id = oi.order_id
  left join products p on p.id = oi.product_id
  where o.created_at >= p_from and o.created_at <= p_to
    and (p_source is null or o.order_source_id = p_source)
    and o.status::text = any(revenue_statuses);

  select coalesce(sum(amount),0) into v_manual_expense
  from expenses where incurred_on >= p_from_date and incurred_on <= p_to_date;

  select coalesce(sum(spend_bdt),0) into v_ad_cost
  from meta_ad_expenses where expense_date >= p_from_date and expense_date <= p_to_date;

  select coalesce(jsonb_agg(jsonb_build_object('name', status, 'value', cnt)), '[]'::jsonb)
  into v_status_breakdown
  from (
    select status::text as status, count(*) as cnt
    from orders
    where created_at >= p_from and created_at <= p_to
      and (p_source is null or order_source_id = p_source)
    group by status
  ) s;

  with daily_orders as (
    select to_char(created_at at time zone 'UTC', 'YYYY-MM-DD') as day,
           coalesce(sum(total_amount) filter (where status::text = any(revenue_statuses)),0) as income,
           count(*) filter (where status::text = any(revenue_statuses)) * v_rcc as courier_exp,
           count(*) filter (where status::text = 'returned') * (v_rdc + v_rpc) as return_exp
    from orders
    where created_at >= p_from and created_at <= p_to
      and (p_source is null or order_source_id = p_source)
    group by 1
  ),
  daily_items as (
    select to_char(o.created_at at time zone 'UTC', 'YYYY-MM-DD') as day,
           sum(oi.quantity * coalesce(p.cost_price,0)) as product_exp
    from order_items oi
    join orders o on o.id = oi.order_id
    left join products p on p.id = oi.product_id
    where o.created_at >= p_from and o.created_at <= p_to
      and (p_source is null or o.order_source_id = p_source)
      and o.status::text = any(revenue_statuses)
    group by 1
  ),
  daily_exp as (
    select to_char(incurred_on, 'YYYY-MM-DD') as day, sum(amount) as exp
    from expenses where incurred_on >= p_from_date and incurred_on <= p_to_date group by 1
  ),
  daily_ad as (
    select to_char(expense_date, 'YYYY-MM-DD') as day, sum(spend_bdt) as exp
    from meta_ad_expenses where expense_date >= p_from_date and expense_date <= p_to_date group by 1
  ),
  all_days as (
    select day from daily_orders
    union select day from daily_items
    union select day from daily_exp
    union select day from daily_ad
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'day', d.day,
    'income', coalesce(o.income,0),
    'expense', coalesce(o.courier_exp,0) + coalesce(o.return_exp,0) + coalesce(i.product_exp,0) + coalesce(e.exp,0) + coalesce(a.exp,0)
  ) order by d.day), '[]'::jsonb) into v_income_vs_expense
  from all_days d
  left join daily_orders o on o.day = d.day
  left join daily_items i on i.day = d.day
  left join daily_exp e on e.day = d.day
  left join daily_ad a on a.day = d.day;

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', s.uid,
    'name', coalesce(p.full_name, p.email, case when s.uid is null then 'Unassigned / Webhook' else 'Unknown' end),
    'orders', s.orders,
    'sales', s.sales
  ) order by s.sales desc), '[]'::jsonb) into v_staff
  from (
    select created_by as uid,
           count(*) as orders,
           coalesce(sum(total_amount) filter (where status::text = any(revenue_statuses)),0) as sales
    from orders
    where created_at >= p_from and created_at <= p_to
      and (p_source is null or order_source_id = p_source)
    group by created_by
  ) s
  left join profiles p on p.id = s.uid;

  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'qty', qty, 'revenue', revenue) order by qty desc), '[]'::jsonb)
  into v_top_products
  from (
    select coalesce(p.name, 'Unknown') as name,
           sum(oi.quantity)::int as qty,
           sum(oi.quantity * oi.unit_price) as revenue
    from order_items oi
    join orders o on o.id = oi.order_id
    left join products p on p.id = oi.product_id
    where o.created_at >= p_from and o.created_at <= p_to
      and (p_source is null or o.order_source_id = p_source)
    group by coalesce(p.name, 'Unknown')
    order by sum(oi.quantity) desc
    limit 10
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'order_number', order_number, 'customer_name', customer_name,
    'customer_phone', customer_phone, 'total_amount', total_amount, 'created_at', created_at
  ) order by created_at desc), '[]'::jsonb)
  into v_returned_orders
  from orders
  where created_at >= p_from and created_at <= p_to
    and (p_source is null or order_source_id = p_source)
    and status::text = 'returned';

  select coalesce(jsonb_object_agg(uid::text, jsonb_build_object('count', cnt, 'total', tot)), '{}'::jsonb)
  into v_user_stats
  from (
    select created_by as uid, count(*) as cnt, coalesce(sum(total_amount),0) as tot
    from orders
    where created_at >= p_from and created_at <= p_to
      and (p_source is null or order_source_id = p_source)
      and created_by is not null
    group by created_by
  ) u;

  return jsonb_build_object(
    'summary', jsonb_build_object(
      'revenue', v_revenue,
      'productCost', v_product_cost,
      'manualExpense', v_manual_expense,
      'adCost', v_ad_cost,
      'returnExpense', v_returned_count * (v_rdc + v_rpc),
      'courierCharge', v_revenue_order_count * v_rcc,
      'orderCount', v_order_count,
      'orderValueTotal', v_order_value_total,
      'revenueOrderCount', v_revenue_order_count,
      'returnedCount', v_returned_count
    ),
    'statusBreakdown', v_status_breakdown,
    'incomeVsExpense', v_income_vs_expense,
    'staff', v_staff,
    'topProducts', v_top_products,
    'returnedOrders', v_returned_orders,
    'userStats', v_user_stats
  );
end;
$$;

grant execute on function public.get_reports_bundle(timestamptz, timestamptz, date, date, uuid) to authenticated;