-- Multi-business / multi-store refactor. Additive migration with safe backfills.

create table if not exists public.client_businesses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  is_primary boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(client_id,company_id)
);

alter table public.memberships add column if not exists all_stores boolean not null default false;

create table if not exists public.membership_stores (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  membership_id uuid not null references public.memberships(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(membership_id,store_id)
);

-- Existing administrators own their businesses. Existing single-store employees keep access.
insert into public.client_businesses(client_id,company_id,is_primary,created_by)
select m.user_id,m.company_id,true,coalesce(m.created_by,m.user_id)
from public.memberships m join public.roles r on r.id=m.role_id
where r.code='company_admin'
on conflict(client_id,company_id) do nothing;

update public.memberships m set all_stores=true
from public.roles r where r.id=m.role_id and (r.code='company_admin' or m.store_id is null);

insert into public.membership_stores(company_id,membership_id,store_id,created_by)
select m.company_id,m.id,m.store_id,coalesce(m.created_by,m.user_id)
from public.memberships m where m.store_id is not null
on conflict(membership_id,store_id) do nothing;

alter table public.categories add column if not exists store_id uuid references public.stores(id) on delete cascade;
alter table public.suppliers add column if not exists store_id uuid references public.stores(id) on delete cascade;
alter table public.products add column if not exists store_id uuid references public.stores(id) on delete cascade;
alter table public.products add column if not exists image_urls text[] not null default array[]::text[];

update public.categories row set store_id=(select s.id from public.stores s where s.company_id=row.company_id order by s.created_at limit 1) where store_id is null;
update public.suppliers row set store_id=(select s.id from public.stores s where s.company_id=row.company_id order by s.created_at limit 1) where store_id is null;
update public.products row set store_id=(select s.id from public.stores s where s.company_id=row.company_id order by s.created_at limit 1) where store_id is null;
update public.products set image_urls=array[image_url] where image_url is not null and cardinality(image_urls)=0;

alter table public.categories alter column store_id set not null;
alter table public.suppliers alter column store_id set not null;
alter table public.products alter column store_id set not null;

alter table public.products drop constraint if exists products_image_urls_max_two;
alter table public.products add constraint products_image_urls_max_two check(cardinality(image_urls)<=2);
alter table public.products drop constraint if exists products_company_id_sku_key;
alter table public.product_variants drop constraint if exists product_variants_company_id_sku_key;
create unique index if not exists products_store_sku_key on public.products(store_id,sku);
create index if not exists categories_store_name_idx on public.categories(store_id,lower(trim(name)));
create index if not exists suppliers_store_name_idx on public.suppliers(store_id,lower(trim(name)));

create or replace function public.validate_supplier_name()
returns trigger language plpgsql set search_path=public as $$
begin
  if exists(select 1 from suppliers s where s.store_id=new.store_id and lower(trim(s.name))=lower(trim(new.name)) and s.id<>new.id)
  then raise exception 'Un fournisseur portant ce nom existe déjà dans cette boutique'; end if;
  return new;
end $$;

drop policy if exists sale_items_sales_select on public.sale_items;
drop policy if exists sale_items_tenant_select on public.sale_items;
create policy sale_items_store_select on public.sale_items for select to authenticated using(
  exists(select 1 from sales s where s.id=sale_id and s.company_id=sale_items.company_id and public.can_access_store(s.company_id,s.store_id))
  and public.has_permission(company_id,'sales.read')
);

create or replace function public.validate_product_codes()
returns trigger language plpgsql set search_path=public as $$
begin
  if exists(select 1 from product_variants v join products p on p.id=v.product_id where p.store_id=new.store_id and (v.sku=new.sku or (new.barcode is not null and v.barcode=new.barcode)))
  then raise exception 'Ce SKU ou code-barres est déjà utilisé dans cette boutique'; end if;
  return new;
end $$;

create or replace function public.validate_variant_codes()
returns trigger language plpgsql set search_path=public as $$
declare v_store uuid;
begin
  select store_id into v_store from products where id=new.product_id;
  if exists(select 1 from products p where p.store_id=v_store and (p.sku=new.sku or (new.barcode is not null and p.barcode=new.barcode)))
    or exists(select 1 from product_variants v join products p on p.id=v.product_id where p.store_id=v_store and v.id<>new.id and (v.sku=new.sku or (new.barcode is not null and v.barcode=new.barcode)))
  then raise exception 'Ce SKU ou code-barres est déjà utilisé dans cette boutique'; end if;
  return new;
end $$;

create index if not exists client_businesses_client_idx on public.client_businesses(client_id);
create index if not exists membership_stores_membership_idx on public.membership_stores(membership_id);
create index if not exists membership_stores_store_idx on public.membership_stores(store_id);
create index if not exists products_store_idx on public.products(store_id);
create index if not exists categories_store_idx on public.categories(store_id);
create index if not exists suppliers_store_idx on public.suppliers(store_id);

create trigger touch_updated_at before update on public.client_businesses for each row execute function public.touch_updated_at();
create trigger touch_updated_at before update on public.membership_stores for each row execute function public.touch_updated_at();

create or replace function public.is_business_owner(p_company uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_super_admin() or exists(
    select 1 from client_businesses cb join companies c on c.id=cb.company_id
    where cb.client_id=auth.uid() and cb.company_id=p_company and c.is_active
  )
$$;

create or replace function public.belongs_to_company(p_company uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_super_admin() or public.is_business_owner(p_company) or exists(
    select 1 from memberships m join companies c on c.id=m.company_id
    where m.user_id=auth.uid() and m.company_id=p_company and m.is_active and c.is_active
  )
$$;

create or replace function public.can_access_store(p_company uuid,p_store uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_super_admin() or public.is_business_owner(p_company) or exists(
    select 1 from memberships m
    join companies c on c.id=m.company_id and c.is_active
    where m.user_id=auth.uid() and m.company_id=p_company and m.is_active
      and (m.all_stores or exists(select 1 from membership_stores ms where ms.membership_id=m.id and ms.store_id=p_store and ms.company_id=p_company))
  )
$$;

create or replace function public.create_business(p_company_name text,p_store_name text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_company uuid;v_store uuid;v_admin uuid;v_plan uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(trim(p_company_name))<2 or length(trim(p_store_name))<2 then raise exception 'Nom invalide'; end if;
  insert into companies(name,created_by) values(trim(p_company_name),auth.uid()) returning id into v_company;
  insert into stores(company_id,name,created_by) values(v_company,trim(p_store_name),auth.uid()) returning id into v_store;
  insert into roles(company_id,name,code,created_by) values(v_company,'Propriétaire','company_admin',auth.uid()) returning id into v_admin;
  insert into memberships(company_id,user_id,role_id,store_id,all_stores,created_by) values(v_company,auth.uid(),v_admin,v_store,true,auth.uid());
  insert into client_businesses(client_id,company_id,is_primary,created_by) values(auth.uid(),v_company,not exists(select 1 from client_businesses where client_id=auth.uid()),auth.uid());
  insert into membership_stores(company_id,membership_id,store_id,created_by)
    select v_company,id,v_store,auth.uid() from memberships where company_id=v_company and user_id=auth.uid();
  insert into roles(company_id,name,code,created_by) values
    (v_company,'Manager','employee',auth.uid()),(v_company,'Caissier','employee',auth.uid()),
    (v_company,'Gestionnaire de stock','employee',auth.uid()),(v_company,'Comptable','employee',auth.uid());
  select id into v_plan from subscription_plans where code='basic';
  insert into subscriptions(company_id,plan_id,status,trial_ends_at,current_period_ends_at,created_by)
    values(v_company,v_plan,'trialing',now()+interval '14 days',now()+interval '14 days',auth.uid());
  return v_company;
end $$;

create or replace function public.bootstrap_company(p_company_name text,p_store_name text)
returns uuid language sql security definer set search_path=public as $$
  select public.create_business(p_company_name,p_store_name)
$$;

create or replace function public.get_accessible_businesses()
returns table(company_id uuid,company_name text,membership_id uuid,role app_role,role_name text,subscription_status subscription_status)
language sql stable security definer set search_path=public as $$
  select m.company_id,c.name,m.id,r.code,r.name,s.status
  from memberships m join companies c on c.id=m.company_id and c.is_active join roles r on r.id=m.role_id
  left join lateral(select status from subscriptions where company_id=m.company_id order by created_at desc limit 1)s on true
  where m.user_id=auth.uid() and m.is_active
  order by c.created_at
$$;

create or replace function public.get_accessible_stores(p_company_id uuid)
returns table(store_id uuid,store_name text,address text)
language sql stable security definer set search_path=public as $$
  select s.id,s.name,s.address from stores s
  where s.company_id=p_company_id and s.is_active and public.can_access_store(p_company_id,s.id)
  order by s.created_at
$$;

create or replace function public.get_workspace_context(p_company_id uuid,p_store_id uuid)
returns table(membership_id uuid,company_id uuid,company_name text,store_id uuid,store_name text,role app_role,role_name text,permissions text[],subscription_status subscription_status)
language sql stable security definer set search_path=public as $$
  select m.id,m.company_id,c.name,s.id,s.name,r.code,r.name,
    coalesce(array_agg(distinct p.code) filter(where p.code is not null),array[]::text[]),sub.status
  from memberships m join companies c on c.id=m.company_id and c.is_active join roles r on r.id=m.role_id
  join stores s on s.id=p_store_id and s.company_id=m.company_id and s.is_active
  left join role_permissions rp on rp.role_id=r.id left join permissions p on p.id=rp.permission_id
  left join lateral(select status from subscriptions where company_id=m.company_id order by created_at desc limit 1)sub on true
  where m.user_id=auth.uid() and m.is_active and m.company_id=p_company_id and public.can_access_store(m.company_id,s.id)
  group by m.id,c.name,s.id,s.name,r.code,r.name,sub.status
$$;

create or replace function public.update_employee_access(
  p_membership_id uuid,p_role_id uuid,p_store_ids uuid[],p_all_stores boolean,p_is_active boolean
) returns void language plpgsql security definer set search_path=public as $$
declare v_company uuid;
begin
  select m.company_id into v_company from memberships m
  where m.id=p_membership_id and (public.is_business_owner(m.company_id) or public.has_permission(m.company_id,'memberships.write'));
  if v_company is null then raise exception 'Accès refusé'; end if;
  if not exists(select 1 from roles r where r.id=p_role_id and r.company_id=v_company and r.code='employee') then raise exception 'Rôle invalide'; end if;
  if exists(select 1 from unnest(coalesce(p_store_ids,array[]::uuid[])) sid where not exists(select 1 from stores s where s.id=sid and s.company_id=v_company and s.is_active)) then raise exception 'Boutique invalide'; end if;
  update memberships set role_id=p_role_id,all_stores=p_all_stores,store_id=case when p_all_stores then null else p_store_ids[1] end,is_active=p_is_active where id=p_membership_id;
  delete from membership_stores where membership_id=p_membership_id;
  if not p_all_stores then
    insert into membership_stores(company_id,membership_id,store_id,created_by)
    select v_company,p_membership_id,sid,auth.uid() from unnest(coalesce(p_store_ids,array[]::uuid[])) sid;
  end if;
end $$;

create or replace function public.delete_employee(p_membership_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_company uuid;
begin
  select m.company_id into v_company from memberships m join roles r on r.id=m.role_id
  where m.id=p_membership_id and r.code='employee' and (public.is_business_owner(m.company_id) or public.has_permission(m.company_id,'memberships.write'));
  if v_company is null then raise exception 'Accès refusé'; end if;
  delete from memberships where id=p_membership_id;
end $$;

alter table public.client_businesses enable row level security;
alter table public.membership_stores enable row level security;
create policy client_businesses_select on public.client_businesses for select to authenticated using(client_id=auth.uid() or public.is_super_admin());
create policy membership_stores_select on public.membership_stores for select to authenticated using(public.belongs_to_company(company_id));
create policy membership_stores_write on public.membership_stores for all to authenticated using(public.is_business_owner(company_id) or public.has_permission(company_id,'memberships.write')) with check(public.is_business_owner(company_id) or public.has_permission(company_id,'memberships.write'));

-- Catalogue reads and writes are both company- and store-scoped.
do $$ declare t text;begin foreach t in array array['categories','suppliers','products'] loop
  execute format('drop policy if exists %I on public.%I',t||'_tenant_select',t);
  execute format('drop policy if exists %I on public.%I',t||'_tenant_insert',t);
  execute format('drop policy if exists %I on public.%I',t||'_tenant_update',t);
  execute format('drop policy if exists %I on public.%I',t||'_tenant_delete',t);
  execute format('create policy %I on public.%I for select to authenticated using(public.belongs_to_company(company_id) and public.can_access_store(company_id,store_id) and public.has_permission(company_id,%L))',t||'_store_select',t,t||'.read');
  execute format('create policy %I on public.%I for insert to authenticated with check(public.belongs_to_company(company_id) and public.can_access_store(company_id,store_id) and public.has_active_subscription(company_id) and public.has_permission(company_id,%L))',t||'_store_insert',t,t||'.write');
  execute format('create policy %I on public.%I for update to authenticated using(public.belongs_to_company(company_id) and public.can_access_store(company_id,store_id) and public.has_active_subscription(company_id) and public.has_permission(company_id,%L)) with check(public.can_access_store(company_id,store_id))',t||'_store_update',t,t||'.write');
  execute format('create policy %I on public.%I for delete to authenticated using(public.belongs_to_company(company_id) and public.can_access_store(company_id,store_id) and public.has_active_subscription(company_id) and public.has_permission(company_id,%L))',t||'_store_delete',t,t||'.write');
end loop;end $$;

drop policy if exists stores_tenant_select on public.stores;
create policy stores_accessible_select on public.stores for select to authenticated
using(public.belongs_to_company(company_id) and public.can_access_store(company_id,id));

-- Operational tables containing store_id must never expose another store.
do $$ declare item text[];begin
  foreach item slice 1 in array array[
    ['stock_levels','stock_movements.read'],['stock_movements','stock_movements.read'],
    ['sales','sales.read'],['purchases','purchases.read'],['expenses','expenses.read'],
    ['inventories','inventories.read'],['daily_reports','daily_reports.read'],
    ['monthly_reports','monthly_reports.read'],['cash_transactions','cash_transactions.read']
  ] loop
    execute format('drop policy if exists %I on public.%I',item[1]||'_tenant_select',item[1]);
    execute format('drop policy if exists %I on public.%I',item[1]||'_scoped_select',item[1]);
    execute format('create policy %I on public.%I for select to authenticated using(public.belongs_to_company(company_id) and public.can_access_store(company_id,store_id) and public.has_permission(company_id,%L))',item[1]||'_store_select',item[1],item[2]);
  end loop;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('product-images','product-images',false,3145728,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy product_images_read on storage.objects for select to authenticated using(
  bucket_id='product-images' and public.can_access_store((storage.foldername(name))[1]::uuid,(storage.foldername(name))[2]::uuid)
);
create policy product_images_insert on storage.objects for insert to authenticated with check(
  bucket_id='product-images' and public.can_access_store((storage.foldername(name))[1]::uuid,(storage.foldername(name))[2]::uuid)
  and public.has_permission((storage.foldername(name))[1]::uuid,'products.write')
);
create policy product_images_update on storage.objects for update to authenticated using(
  bucket_id='product-images' and public.can_access_store((storage.foldername(name))[1]::uuid,(storage.foldername(name))[2]::uuid)
  and public.has_permission((storage.foldername(name))[1]::uuid,'products.write')
);
create policy product_images_delete on storage.objects for delete to authenticated using(
  bucket_id='product-images' and public.can_access_store((storage.foldername(name))[1]::uuid,(storage.foldername(name))[2]::uuid)
  and public.has_permission((storage.foldername(name))[1]::uuid,'products.write')
);

grant execute on function public.create_business(text,text) to authenticated;
grant execute on function public.get_accessible_businesses() to authenticated;
grant execute on function public.get_accessible_stores(uuid) to authenticated;
grant execute on function public.get_workspace_context(uuid,uuid) to authenticated;
grant execute on function public.update_employee_access(uuid,uuid,uuid[],boolean,boolean) to authenticated;
grant execute on function public.delete_employee(uuid) to authenticated;
revoke all on function public.create_business(text,text) from anon;
revoke all on function public.get_accessible_businesses() from anon;
revoke all on function public.get_accessible_stores(uuid) from anon;
revoke all on function public.get_workspace_context(uuid,uuid) from anon;
revoke all on function public.update_employee_access(uuid,uuid,uuid[],boolean,boolean) from anon;
revoke all on function public.delete_employee(uuid) from anon;
