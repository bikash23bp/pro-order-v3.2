
-- Helper to check user_permissions flag
create or replace function public.has_permission(_user_id uuid, _perm text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v boolean;
begin
  execute format('select coalesce((select %I from public.user_permissions where user_id = $1), false)', _perm)
    into v using _user_id;
  return coalesce(v, false);
end;
$$;

-- Allow telesales managers (with can_manage_telesales) to insert/update assignments
create policy "telesales managers insert assignments"
  on public.telesales_assignments
  for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'can_manage_telesales'));

create policy "telesales managers update assignments"
  on public.telesales_assignments
  for update
  to authenticated
  using (public.has_permission(auth.uid(), 'can_manage_telesales'))
  with check (public.has_permission(auth.uid(), 'can_manage_telesales'));
