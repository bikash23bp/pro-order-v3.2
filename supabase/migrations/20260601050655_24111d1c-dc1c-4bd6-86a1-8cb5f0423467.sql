ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'ready_order';