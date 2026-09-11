-- Preserve profile editing while reserving platform privileges for the server.
begin;
revoke insert,update,delete on public.profiles from public,anon,authenticated;
do $$
declare column_list text;
begin
  select string_agg(quote_ident(column_name), ',') into column_list
  from information_schema.columns where table_schema='public' and table_name='profiles';
  execute 'revoke update (' || column_list || ') on public.profiles from public,anon,authenticated';
end $$;
grant update(full_name,avatar_url) on public.profiles to authenticated;

-- Platform administrators use dedicated platform RPCs, not tenant privileges.
create or replace function public.is_company_admin(p_company_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(
    select 1 from public.memberships m
    join public.roles r on r.id=m.role_id and r.company_id=m.company_id
    join public.companies c on c.id=m.company_id
      and c.is_active and c.plan_archived_at is null
    where m.user_id=auth.uid() and m.company_id=p_company_id
      and m.is_active and r.code='company_admin'
  );
$$;
alter function public.is_company_admin(uuid) owner to postgres;
revoke all on function public.is_company_admin(uuid) from public,anon;
grant execute on function public.is_company_admin(uuid) to authenticated;

create or replace function public.get_lifetime_net_profit(p_store_id uuid)
returns numeric language plpgsql stable security definer set search_path='' as $$
declare v_company uuid; v_profit numeric; v_expenses numeric;
begin
  select company_id into v_company from public.stores where id=p_store_id;
  if v_company is null or not public.is_company_admin(v_company)
     or not public.can_access_store(v_company,p_store_id) then
    raise exception 'Accès financier réservé à l''administrateur';
  end if;
  select coalesce(sum(gross_profit),0) into v_profit from public.sales
    where company_id=v_company and store_id=p_store_id;
  select coalesce(sum(amount),0) into v_expenses from public.expenses
    where company_id=v_company and store_id=p_store_id;
  return v_profit-v_expenses;
end $$;
revoke all on function public.get_lifetime_net_profit(uuid) from public,anon;
grant execute on function public.get_lifetime_net_profit(uuid) to authenticated;

-- Product editors already handle purchase prices. Read-only employees do not.
-- Historical sale profits remain reserved to company administrators.
create or replace function public.can_read_product_cost(p_company_id uuid,p_store_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null
    and public.belongs_to_company(p_company_id)
    and public.can_access_store(p_company_id,p_store_id)
    and (public.is_company_admin(p_company_id)
      or public.has_permission(p_company_id,'products.write')
      or public.has_permission(p_company_id,'products.purchase_price.update'));
$$;
alter function public.can_read_product_cost(uuid,uuid) owner to postgres;
revoke all on function public.can_read_product_cost(uuid,uuid) from public,anon;
grant execute on function public.can_read_product_cost(uuid,uuid) to authenticated;

-- RLS limits rows; explicit column grants protect their purchase prices.
do $$
declare v_table text; safe_columns text;
begin
  foreach v_table in array array['products','product_variants'] loop
    execute format('revoke select on public.%I from public,anon,authenticated',v_table);
    execute format('revoke select (purchase_price) on public.%I from public,anon,authenticated',v_table);
    select string_agg(quote_ident(c.column_name), ',') into safe_columns
    from information_schema.columns c
    where c.table_schema='public' and c.table_name=v_table and c.column_name<>'purchase_price';
    execute format('grant select (%s) on public.%I to authenticated',safe_columns,v_table);
  end loop;
end $$;

create or replace view public.product_costs
with (security_barrier=true,security_invoker=false) as
select p.id as product_id,p.company_id,p.store_id,p.purchase_price
from public.products p
where public.can_read_product_cost(p.company_id,p.store_id);

create or replace view public.product_variant_costs
with (security_barrier=true,security_invoker=false) as
select v.id as product_variant_id,v.product_id,p.company_id,p.store_id,v.purchase_price
from public.product_variants v join public.products p
  on p.id=v.product_id and p.company_id=v.company_id
where public.can_read_product_cost(p.company_id,p.store_id);

alter view public.product_costs owner to postgres;
alter view public.product_variant_costs owner to postgres;
revoke all on public.product_costs,public.product_variant_costs from public,anon;
grant select on public.product_costs,public.product_variant_costs to authenticated;
notify pgrst,'reload schema';
commit;
