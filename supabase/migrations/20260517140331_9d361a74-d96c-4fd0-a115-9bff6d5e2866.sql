
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS customer_phone text,
  ADD COLUMN IF NOT EXISTS customer_source text;

CREATE INDEX IF NOT EXISTS idx_tasks_customer_phone ON public.tasks(customer_phone);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON public.tasks(assigned_to);

-- Customer search across membership + orders
CREATE OR REPLACE FUNCTION public.search_task_customers(p_query text)
RETURNS TABLE(source text, name text, phone text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH q AS (
    SELECT NULLIF(btrim(p_query), '') AS s
  ),
  membership AS (
    SELECT 'membership'::text AS source,
           COALESCE(NULLIF(btrim(m.name),''), 'Unnamed') AS name,
           m.phone AS phone
    FROM public.membership_customers m, q
    WHERE q.s IS NULL
       OR m.phone ILIKE '%' || q.s || '%'
       OR m.name  ILIKE '%' || q.s || '%'
    LIMIT 25
  ),
  orders_c AS (
    SELECT DISTINCT ON (o.customer_phone)
           'order'::text AS source,
           COALESCE(NULLIF(btrim(o.customer_name),''), 'Unnamed') AS name,
           o.customer_phone AS phone
    FROM public.orders o, q
    WHERE o.customer_phone IS NOT NULL
      AND (q.s IS NULL
        OR o.customer_phone ILIKE '%' || q.s || '%'
        OR o.customer_name  ILIKE '%' || q.s || '%')
    ORDER BY o.customer_phone, o.created_at DESC
    LIMIT 25
  ),
  unioned AS (
    SELECT * FROM membership
    UNION
    SELECT * FROM orders_c
  )
  SELECT DISTINCT ON (phone) source, name, phone
  FROM unioned
  WHERE auth.uid() IS NOT NULL AND phone IS NOT NULL
  ORDER BY phone, source
  LIMIT 20;
$$;

REVOKE EXECUTE ON FUNCTION public.search_task_customers(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_task_customers(text) TO authenticated;

-- Per-user assignment stats
CREATE OR REPLACE FUNCTION public.task_assignment_stats(p_from timestamptz, p_to timestamptz)
RETURNS TABLE(
  user_id uuid,
  display_name text,
  pending int,
  on_hold int,
  completed int,
  total int,
  avg_completion_seconds numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    p.id AS user_id,
    COALESCE(NULLIF(btrim(p.full_name), ''), p.email, 'User') AS display_name,
    COALESCE(SUM(CASE WHEN t.status = 'pending'   THEN 1 ELSE 0 END), 0)::int AS pending,
    COALESCE(SUM(CASE WHEN t.status = 'on_hold'   THEN 1 ELSE 0 END), 0)::int AS on_hold,
    COALESCE(SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END), 0)::int AS completed,
    COALESCE(COUNT(t.id), 0)::int AS total,
    AVG(CASE WHEN t.status = 'completed' AND t.completed_at IS NOT NULL
             THEN EXTRACT(EPOCH FROM (t.completed_at - t.created_at))
             ELSE NULL END)::numeric AS avg_completion_seconds
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  LEFT JOIN public.tasks t
    ON t.assigned_to = p.id
   AND t.created_at >= p_from
   AND t.created_at <  p_to
  WHERE auth.uid() IS NOT NULL
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR p.id = auth.uid())
  GROUP BY p.id, p.full_name, p.email
  ORDER BY total DESC, display_name;
$$;

REVOKE EXECUTE ON FUNCTION public.task_assignment_stats(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.task_assignment_stats(timestamptz, timestamptz) TO authenticated;
