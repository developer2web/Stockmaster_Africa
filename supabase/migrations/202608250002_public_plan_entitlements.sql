-- Publish the same plan limits and enabled feature keys used by the application.
drop function if exists public.list_public_plans();
create function public.list_public_plans()
returns table(
  code text,
  name text,
  description text,
  monthly_price numeric,
  currency text,
  max_businesses integer,
  max_stores integer,
  max_employees integer,
  feature_keys text[]
)
language sql stable security definer set search_path=public as $$
  select p.code,p.name,p.description,p.monthly_price,p.currency::text,
    p.max_businesses,p.max_stores,p.max_employees,
    coalesce(array_agg(pf.feature_key order by pf.feature_key) filter(where pf.is_enabled),array[]::text[])
  from public.plans p
  left join public.plan_features pf on pf.plan_id=p.id
  where p.is_active
  group by p.id
  order by p.monthly_price,p.name;
$$;
revoke all on function public.list_public_plans() from public;
grant execute on function public.list_public_plans() to anon,authenticated;
