-- Phase 2 hardening: store-scoped expenses, unambiguous catalog codes and audit trail.

create or replace function public.can_access_store(p_company uuid,p_store uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_super_admin() or exists(
    select 1 from memberships m join roles r on r.id=m.role_id
    where m.user_id=auth.uid() and m.company_id=p_company and m.is_active
      and (r.code='company_admin' or m.store_id is null or m.store_id=p_store)
  )
$$;

drop policy if exists expenses_tenant_select on public.expenses;
drop policy if exists expenses_tenant_insert on public.expenses;
drop policy if exists expenses_tenant_update on public.expenses;
drop policy if exists expenses_tenant_delete on public.expenses;
create policy expenses_scoped_select on public.expenses for select to authenticated
using(public.belongs_to_company(company_id) and public.has_permission(company_id,'expenses.read') and public.can_access_store(company_id,store_id));
create policy expenses_scoped_insert on public.expenses for insert to authenticated
with check(public.belongs_to_company(company_id) and public.has_active_subscription(company_id) and public.has_permission(company_id,'expenses.write') and public.can_access_store(company_id,store_id));
create policy expenses_scoped_update on public.expenses for update to authenticated
using(public.belongs_to_company(company_id) and public.has_active_subscription(company_id) and public.has_permission(company_id,'expenses.write') and public.can_access_store(company_id,store_id))
with check(public.belongs_to_company(company_id) and public.can_access_store(company_id,store_id));
create policy expenses_scoped_delete on public.expenses for delete to authenticated
using(public.belongs_to_company(company_id) and public.has_active_subscription(company_id) and public.has_permission(company_id,'expenses.write') and public.can_access_store(company_id,store_id));

create or replace function public.validate_supplier_name()
returns trigger language plpgsql set search_path=public as $$
begin
  if exists(select 1 from suppliers s where s.company_id=new.company_id and lower(trim(s.name))=lower(trim(new.name)) and s.id<>new.id)
  then raise exception 'Un fournisseur portant ce nom existe déjà'; end if;
  return new;
end $$;
create trigger validate_supplier_name before insert or update of company_id,name on public.suppliers
for each row execute function public.validate_supplier_name();

create or replace function public.validate_product_codes()
returns trigger language plpgsql set search_path=public as $$
begin
  if exists(select 1 from product_variants v where v.company_id=new.company_id and (v.sku=new.sku or (new.barcode is not null and v.barcode=new.barcode)))
  then raise exception 'Ce SKU ou code-barres est déjà utilisé par une variante'; end if;
  return new;
end $$;
create trigger validate_product_codes before insert or update of company_id,sku,barcode on public.products
for each row execute function public.validate_product_codes();

create or replace function public.validate_variant_codes()
returns trigger language plpgsql set search_path=public as $$
begin
  if exists(select 1 from products p where p.company_id=new.company_id and (p.sku=new.sku or (new.barcode is not null and p.barcode=new.barcode)))
    or exists(select 1 from product_variants v where v.company_id=new.company_id and v.id<>new.id and (v.sku=new.sku or (new.barcode is not null and v.barcode=new.barcode)))
  then raise exception 'Ce SKU ou code-barres est déjà utilisé'; end if;
  return new;
end $$;
create trigger validate_variant_codes before insert or update of company_id,sku,barcode on public.product_variants
for each row execute function public.validate_variant_codes();

create or replace function public.write_audit_log()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_company uuid;v_id uuid;v_payload jsonb;
begin
  if tg_op='DELETE' then v_company=old.company_id;v_id=old.id;v_payload=jsonb_build_object('old',to_jsonb(old));
  elsif tg_op='INSERT' then v_company=new.company_id;v_id=new.id;v_payload=jsonb_build_object('new',to_jsonb(new));
  else v_company=new.company_id;v_id=new.id;v_payload=jsonb_build_object('old',to_jsonb(old),'new',to_jsonb(new));end if;
  insert into audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by)
  values(v_company,auth.uid(),lower(tg_op),tg_table_name,v_id,v_payload,auth.uid());
  if tg_op='DELETE' then return old;end if;
  return new;
end $$;

do $$ declare t text;begin
  foreach t in array array['products','product_variants','categories','suppliers','expenses','memberships','roles','stock_movements','sales'] loop
    execute format('create trigger audit_%I after insert or update or delete on public.%I for each row execute function public.write_audit_log()',t,t);
  end loop;
end $$;
