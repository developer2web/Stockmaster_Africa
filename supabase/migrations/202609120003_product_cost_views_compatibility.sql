begin;
-- Supply missing views without changing existing table privileges.
create or replace function public.can_read_product_cost(p_company_id uuid,p_store_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null
    and exists(select 1 from public.memberships m join public.companies c on c.id=m.company_id
      where m.company_id=p_company_id and m.user_id=auth.uid() and m.is_active and c.is_active and c.plan_archived_at is null)
    and public.belongs_to_company(p_company_id)
    and public.can_access_store(p_company_id,p_store_id)
    and (public.is_company_admin(p_company_id)
      or public.has_permission(p_company_id,'products.write')
      or public.has_permission(p_company_id,'products.purchase_price.update'));
$$;
alter function public.can_read_product_cost(uuid,uuid) owner to postgres;
revoke all on function public.can_read_product_cost(uuid,uuid) from public,anon;
grant execute on function public.can_read_product_cost(uuid,uuid) to authenticated;

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
