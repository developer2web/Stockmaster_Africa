-- Le site public lit le même tarif GNF que company_subscription_plans et subscription_quote.
-- Aucun changement des prix ni des droits ; conservation de la signature publique.
create or replace function public.list_public_plans()
returns table(code text,name text,description text,monthly_price numeric,currency text,
  max_businesses integer,max_stores integer,max_employees integer,feature_keys text[])
language sql stable security definer set search_path=public as $$
  select p.code,p.name,p.description,pp.monthly_price,pp.currency::text,
    p.max_businesses,p.max_stores,p.max_employees,
    coalesce((select array_agg(pf.feature_key order by pf.feature_key)
      from public.plan_features pf where pf.plan_id=p.id and pf.is_enabled),array[]::text[])
  from public.plans p
  join public.plan_currency_prices pp on pp.plan_id=p.id and pp.currency='GNF'
  where p.is_active
  order by pp.monthly_price,p.name;
$$;
revoke all on function public.list_public_plans() from public;
grant execute on function public.list_public_plans() to anon,authenticated;
