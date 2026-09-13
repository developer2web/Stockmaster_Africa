begin;
-- get_business_report, get_financial_sales_safe and the client's cash/expense
-- queries already treat a null store as "every store of the company" (the
-- "consolidated_reports" entitlement sold on the top plan). get_report_filters
-- was the one piece still requiring a specific store, so "toutes les
-- boutiques" could never actually be selected. Add an explicit company id for
-- that case instead of guessing a company from an absent store row.
-- The previous signature took exactly one required argument; add the new
-- optional parameter as a distinct overload instead of an ambiguous one.
drop function if exists public.get_report_filters(uuid);
create or replace function public.get_report_filters(p_store_id uuid default null, p_company_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_company uuid;v_result jsonb;
begin
  if p_store_id is not null then
    select company_id into v_company from stores where id=p_store_id and is_active and public.can_access_store(company_id,id);
  elsif p_company_id is not null and public.is_company_admin(p_company_id) then
    v_company:=p_company_id;
  end if;
  if v_company is null or not (
    public.has_permission(v_company,'daily_reports.read') or public.has_permission(v_company,'monthly_reports.read')
  ) then raise exception 'Accès aux rapports refusé'; end if;
  select jsonb_build_object(
    'stores',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name)
      from stores s where s.company_id=v_company and s.is_active and (p_store_id is null or s.id=p_store_id)),'[]'::jsonb),
    'employees',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',coalesce(nullif(p.full_name,''),'Employé')) order by p.full_name)
      from memberships m join profiles p on p.id=m.user_id
      where m.company_id=v_company and m.is_active
        and (p_store_id is null or m.all_stores or exists(select 1 from membership_stores ms where ms.membership_id=m.id and ms.store_id=p_store_id))),'[]'::jsonb),
    'products',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name)
      from products p where p.company_id=v_company and p.is_active and (p_store_id is null or p.store_id=p_store_id)),'[]'::jsonb),
    'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) order by c.name)
      from categories c where c.company_id=v_company and c.is_active and (p_store_id is null or c.store_id=p_store_id)),'[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;
grant execute on function public.get_report_filters(uuid,uuid) to authenticated;
revoke all on function public.get_report_filters(uuid,uuid) from anon;
notify pgrst,'reload schema';
commit;
