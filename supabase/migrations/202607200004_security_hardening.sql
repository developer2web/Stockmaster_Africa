-- Cross-tenant integrity and audit defaults for Phases 1-3.

create or replace function public.set_created_by()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.created_by is null and auth.uid() is not null then new.created_by = auth.uid(); end if;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['companies','stores','warehouses','roles','role_permissions','memberships','subscriptions','payments','categories','products','product_variants','suppliers','customers','stock_movements','sales','sale_items','purchases','purchase_items','expenses','transfers','transfer_items','inventories','inventory_items','notifications','daily_reports','monthly_reports','audit_logs'] loop
    execute format('create trigger set_created_by before insert on public.%I for each row execute function public.set_created_by()',t);
  end loop;
end $$;
create or replace function public.validate_membership_company()
returns trigger language plpgsql set search_path=public as $$
begin
  if not exists(select 1 from roles where id=new.role_id and company_id=new.company_id) then raise exception 'Le rôle n’appartient pas à cette entreprise'; end if;
  if new.store_id is not null and not exists(select 1 from stores where id=new.store_id and company_id=new.company_id) then raise exception 'La boutique n’appartient pas à cette entreprise'; end if;
  return new;
end $$;
create trigger validate_membership_company before insert or update of company_id,role_id,store_id on public.memberships for each row execute function public.validate_membership_company();
create or replace function public.validate_role_permission_company()
returns trigger language plpgsql set search_path=public as $$
begin
  if not exists(select 1 from roles where id=new.role_id and company_id=new.company_id) then raise exception 'Le rôle n’appartient pas à cette entreprise'; end if;
  return new;
end $$;
create trigger validate_role_permission_company before insert or update of company_id,role_id on public.role_permissions for each row execute function public.validate_role_permission_company();
create or replace function public.validate_product_company()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.category_id is not null and not exists(select 1 from categories where id=new.category_id and company_id=new.company_id) then raise exception 'La catégorie n’appartient pas à cette entreprise'; end if;
  if new.supplier_id is not null and not exists(select 1 from suppliers where id=new.supplier_id and company_id=new.company_id) then raise exception 'Le fournisseur n’appartient pas à cette entreprise'; end if;
  return new;
end $$;
create trigger validate_product_company before insert or update of company_id,category_id,supplier_id on public.products for each row execute function public.validate_product_company();
create or replace function public.validate_variant_company()
returns trigger language plpgsql set search_path=public as $$
begin
  if not exists(select 1 from products where id=new.product_id and company_id=new.company_id) then raise exception 'Le produit n’appartient pas à cette entreprise'; end if;
  return new;
end $$;
create trigger validate_variant_company before insert or update of company_id,product_id on public.product_variants for each row execute function public.validate_variant_company();
