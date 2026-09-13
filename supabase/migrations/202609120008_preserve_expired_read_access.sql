begin;
-- A role grant can justify reading existing data even when its write action is disabled.
-- Mutations must continue to use has_permission and the subscription write triggers.
create or replace function public.has_assigned_permission(p_company uuid,p_code text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.memberships m
 join public.companies c on c.id=m.company_id and c.is_active and c.plan_archived_at is null
 join public.roles r on r.id=m.role_id and r.company_id=m.company_id
 left join public.role_permissions rp on rp.role_id=r.id
 left join public.permissions p on p.id=rp.permission_id
 where m.user_id=auth.uid() and m.company_id=p_company and m.is_active
 and (r.code='company_admin' or p.code=p_code
 or (p_code like '%.read' and p.code=regexp_replace(p_code,'\.read$','.write'))))
$$;
revoke all on function public.has_assigned_permission(uuid,text) from public,anon;
grant execute on function public.has_assigned_permission(uuid,text) to authenticated;
create or replace function public.can_read_product_cost(p_company_id uuid,p_store_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select public.belongs_to_company(p_company_id) and public.can_access_store(p_company_id,p_store_id)
 and (public.has_assigned_permission(p_company_id,'products.write')
 or public.has_assigned_permission(p_company_id,'products.purchase_price.update'))
$$;
-- Preserve the SELECT portion of legacy ALL policies, without changing their write checks.
create policy customers_assigned_sales_read on public.customers for select to authenticated
 using (public.belongs_to_company(company_id) and public.has_assigned_permission(company_id,'sales.write'));
create policy membership_stores_assigned_read on public.membership_stores for select to authenticated
 using (public.has_assigned_permission(company_id,'memberships.write'));
-- Keep the existing report payload and scope; change only the grant used for reading filters.
do $$
declare definition text;
begin
 select pg_get_functiondef('public.get_report_filters()'::regprocedure) into definition;
 if strpos(definition,'public.has_permission(m.company_id,''stores.write'')')=0 then
   raise exception 'Unexpected report function: review required';
 end if;
 execute replace(definition,'public.has_permission(m.company_id,''stores.write'')','public.has_assigned_permission(m.company_id,''stores.write'')');
end $$;
notify pgrst,'reload schema';
commit;
