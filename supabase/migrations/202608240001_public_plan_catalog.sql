-- Expose only the active commercial catalogue to unauthenticated visitors.
create or replace function public.list_public_plans()
returns table(
  code text,
  name text,
  description text,
  monthly_price numeric,
  currency text,
  max_stores integer,
  max_employees integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.code,
    p.name,
    p.description,
    p.monthly_price,
    p.currency::text,
    p.max_stores,
    p.max_employees
  from public.plans p
  where p.is_active
  order by p.monthly_price, p.name;
$$;

revoke all on function public.list_public_plans() from public;
grant execute on function public.list_public_plans() to anon, authenticated;

