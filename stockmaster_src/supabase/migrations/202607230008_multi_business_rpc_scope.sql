-- Make legacy RPCs select the business from the requested store instead of the
-- first membership. This preserves their audited transactional implementations.
do $migration$
declare fn regprocedure; definition text;
begin
  foreach fn in array array[
    'public.record_stock_movement(uuid,uuid,numeric,text,text,uuid,uuid)'::regprocedure,
    'public.create_sale(uuid,text,jsonb,uuid,uuid)'::regprocedure,
    'public.record_cash_transaction(uuid,public.cash_transaction_type,text,numeric)'::regprocedure,
    'public.get_business_report(date,date,uuid,uuid,uuid,uuid)'::regprocedure
  ] loop
    definition:=pg_get_functiondef(fn);
    definition:=regexp_replace(
      definition,
      'WHERE\\s+m\\.user_id\\s*=\\s*auth\\.uid\\(\\)\\s+AND\\s+m\\.is_active',
      'WHERE m.user_id=auth.uid() AND m.is_active AND (p_store_id IS NULL OR m.company_id=(SELECT company_id FROM public.stores WHERE id=p_store_id))',
      'i'
    );
    definition:=regexp_replace(
      definition,
      'if not v_can_all_stores and \\(v_member_store is null or v_member_store<>p_store_id\\) then raise exception ''[^'']+''; end if;',
      'if not public.can_access_store(v_company,p_store_id) then raise exception ''Cette boutique ne vous est pas attribuée''; end if;',
      'i'
    );
    definition:=regexp_replace(
      definition,
      'if v_membership_store is not null and v_membership_store<>p_store_id and not public.has_permission\\(v_company,''stores.write''\\) then raise exception ''[^'']+''; end if;',
      'if not public.can_access_store(v_company,p_store_id) then raise exception ''Cette boutique ne vous est pas attribuée''; end if;',
      'i'
    );
    execute definition;
  end loop;
end
$migration$;

create or replace function public.lookup_product_code(p_code text,p_store_id uuid)
returns table(product_id uuid,variant_id uuid)
language sql stable security definer set search_path=public as $$
  select p.id,null::uuid from products p
  where p.store_id=p_store_id and p.is_active and public.can_access_store(p.company_id,p_store_id)
    and (p.qr_code=p_code or p.sku=p_code or p.barcode=p_code)
  union all
  select v.product_id,v.id from product_variants v join products p on p.id=v.product_id
  where p.store_id=p_store_id and v.is_active and public.can_access_store(p.company_id,p_store_id)
    and (v.sku=p_code or v.barcode=p_code)
  limit 1
$$;

create or replace function public.get_report_filters(p_store_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_company uuid;v_result jsonb;
begin
  select company_id into v_company from stores where id=p_store_id and is_active and public.can_access_store(company_id,id);
  if v_company is null or not (
    public.has_permission(v_company,'daily_reports.read') or public.has_permission(v_company,'monthly_reports.read')
  ) then raise exception 'Accès aux rapports refusé'; end if;
  select jsonb_build_object(
    'stores',jsonb_build_array(jsonb_build_object('id',s.id,'name',s.name)),
    'employees',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',coalesce(nullif(p.full_name,''),'Employé')) order by p.full_name)
      from memberships m join profiles p on p.id=m.user_id
      where m.company_id=v_company and m.is_active and (m.all_stores or exists(select 1 from membership_stores ms where ms.membership_id=m.id and ms.store_id=p_store_id))),'[]'::jsonb),
    'products',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name)
      from products p where p.store_id=p_store_id and p.is_active),'[]'::jsonb),
    'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) order by c.name)
      from categories c where c.store_id=p_store_id and c.is_active),'[]'::jsonb)
  ) into v_result from stores s where s.id=p_store_id;
  return v_result;
end $$;

create or replace function public.create_employee_role(p_company_id uuid,p_name text,p_permission_codes text[])
returns uuid language plpgsql security definer set search_path=public as $$
declare v_role uuid;
begin
  if not public.is_business_owner(p_company_id) or not public.has_active_subscription(p_company_id) then raise exception 'Accès refusé ou abonnement inactif'; end if;
  insert into roles(company_id,name,code,created_by) values(p_company_id,trim(p_name),'employee',auth.uid()) returning id into v_role;
  insert into role_permissions(company_id,role_id,permission_id,created_by)
  select p_company_id,v_role,p.id,auth.uid() from permissions p where p.code=any(p_permission_codes);
  return v_role;
end $$;

grant execute on function public.lookup_product_code(text,uuid) to authenticated;
grant execute on function public.get_report_filters(uuid) to authenticated;
grant execute on function public.create_employee_role(uuid,text,text[]) to authenticated;
revoke all on function public.lookup_product_code(text,uuid) from anon;
revoke all on function public.get_report_filters(uuid) from anon;
revoke all on function public.create_employee_role(uuid,text,text[]) from anon;
