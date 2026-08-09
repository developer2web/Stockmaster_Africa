-- StockMaster Phase 1 - schema multi-tenant, onboarding, roles and RLS
create extension if not exists pgcrypto;

create type public.app_role as enum ('super_admin', 'company_admin', 'employee');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'expired');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '', avatar_url text, is_super_admin boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.companies (
  id uuid primary key default gen_random_uuid(), name text not null, slug text unique,
  created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.stores (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  name text not null, address text, is_active boolean not null default true, created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.warehouses (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  store_id uuid references public.stores(id), name text not null, created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.roles (
  id uuid primary key default gen_random_uuid(), company_id uuid references public.companies(id) on delete cascade,
  name text not null, code app_role not null, created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(company_id, code)
);
create table public.permissions (
  id uuid primary key default gen_random_uuid(), code text not null unique, description text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.role_permissions (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade, permission_id uuid not null references public.permissions(id) on delete cascade,
  created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(role_id, permission_id)
);
create table public.memberships (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade, role_id uuid not null references public.roles(id),
  store_id uuid references public.stores(id), is_active boolean not null default true, created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(company_id, user_id)
);
create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(), code text not null unique, name text not null, monthly_price numeric(12,2) not null default 0,
  annual_price numeric(12,2) not null default 0, features jsonb not null default '{}', is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  plan_id uuid references public.subscription_plans(id), status subscription_status not null default 'trialing', trial_ends_at timestamptz,
  current_period_ends_at timestamptz, stripe_customer_id text, stripe_subscription_id text, created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.payments (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id), amount numeric(12,2) not null, currency text not null default 'CAD', status text not null,
  stripe_payment_intent_id text, created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- Phase 2+ domain tables are created now so tenant boundaries exist before features are added.
create table public.categories (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, name text not null, created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.products (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, category_id uuid references public.categories(id), name text not null, sku text not null, qr_code text not null default gen_random_uuid()::text, barcode text, purchase_price numeric(12,2) not null default 0, sale_price numeric(12,2) not null default 0, image_url text, created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(company_id, sku), unique(qr_code));
create table public.product_variants (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, product_id uuid not null references public.products(id) on delete cascade, name text not null, sku text not null, barcode text, created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(company_id, sku));
create table public.suppliers (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, name text not null, email text, phone text, created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.customers (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, name text not null, email text, phone text, created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.stock_movements (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, store_id uuid references public.stores(id), warehouse_id uuid references public.warehouses(id), product_id uuid not null references public.products(id), quantity numeric(14,3) not null, movement_type text not null, operation_id uuid unique, created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.sales (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, store_id uuid references public.stores(id), customer_id uuid references public.customers(id), total numeric(12,2) not null default 0, payment_method text, operation_id uuid unique, created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.sale_items (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, sale_id uuid not null references public.sales(id) on delete cascade, product_id uuid not null references public.products(id), purchase_price_snapshot numeric(12,2) not null, sale_price numeric(12,2) not null, quantity numeric(14,3) not null, discount numeric(12,2) not null default 0, gross_profit numeric(12,2) generated always as ((sale_price - purchase_price_snapshot) * quantity) stored, created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.purchases (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, supplier_id uuid references public.suppliers(id), store_id uuid references public.stores(id), total numeric(12,2) not null default 0, created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.purchase_items (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, purchase_id uuid not null references public.purchases(id) on delete cascade, product_id uuid not null references public.products(id), quantity numeric(14,3) not null, unit_cost numeric(12,2) not null, created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.expenses (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, store_id uuid references public.stores(id), label text not null, amount numeric(12,2) not null, expense_date date not null default current_date, created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.transfers (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, from_store_id uuid references public.stores(id), to_store_id uuid references public.stores(id), status text not null default 'pending', created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.transfer_items (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, transfer_id uuid not null references public.transfers(id) on delete cascade, product_id uuid not null references public.products(id), quantity numeric(14,3) not null, created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.inventories (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, store_id uuid references public.stores(id), status text not null default 'draft', counted_at timestamptz, created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.inventory_items (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, inventory_id uuid not null references public.inventories(id) on delete cascade, product_id uuid not null references public.products(id), expected_quantity numeric(14,3) not null, counted_quantity numeric(14,3), created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.notifications (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, user_id uuid references public.profiles(id), title text not null, body text not null, type text not null, read_at timestamptz, created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.daily_reports (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, store_id uuid references public.stores(id), report_date date not null, metrics jsonb not null default '{}', created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(company_id, store_id, report_date));
create table public.monthly_reports (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, store_id uuid references public.stores(id), report_month date not null, metrics jsonb not null default '{}', created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(company_id, store_id, report_month));
create table public.audit_logs (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, actor_id uuid references public.profiles(id), action text not null, entity_type text not null, entity_id uuid, payload jsonb not null default '{}', created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
do $$ declare t text; begin foreach t in array array['profiles','companies','stores','warehouses','roles','permissions','role_permissions','memberships','subscription_plans','subscriptions','payments','categories','products','product_variants','suppliers','customers','stock_movements','sales','sale_items','purchases','purchase_items','expenses','transfers','transfer_items','inventories','inventory_items','notifications','daily_reports','monthly_reports','audit_logs'] loop execute format('create trigger touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()', t); end loop; end $$;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.profiles(id, full_name) values(new.id, coalesce(new.raw_user_meta_data->>'full_name','')) on conflict do nothing; return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.is_super_admin() returns boolean language sql stable security definer set search_path = public as $$ select coalesce((select is_super_admin from profiles where id = auth.uid()), false) $$;
create or replace function public.belongs_to_company(p_company uuid) returns boolean language sql stable security definer set search_path = public as $$ select public.is_super_admin() or exists(select 1 from memberships where user_id=auth.uid() and company_id=p_company and is_active) $$;
create or replace function public.has_active_subscription(p_company uuid) returns boolean language sql stable security definer set search_path = public as $$ select public.is_super_admin() or exists(select 1 from subscriptions where company_id=p_company and status in ('trialing','active') and coalesce(current_period_ends_at, trial_ends_at, now()+interval '1 day') > now()) $$;
create or replace function public.has_permission(p_company uuid, p_code text) returns boolean language sql stable security definer set search_path = public as $$ select public.is_super_admin() or exists(select 1 from memberships m join roles r on r.id=m.role_id left join role_permissions rp on rp.role_id=r.id left join permissions p on p.id=rp.permission_id where m.user_id=auth.uid() and m.company_id=p_company and m.is_active and (r.code='company_admin' or p.code=p_code)) $$;

create or replace function public.bootstrap_company(p_company_name text, p_store_name text) returns uuid language plpgsql security definer set search_path = public as $$
declare v_company uuid; v_store uuid; v_role uuid; v_plan uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if exists(select 1 from memberships where user_id=auth.uid()) then raise exception 'User already belongs to a company'; end if;
  insert into companies(name, created_by) values(trim(p_company_name), auth.uid()) returning id into v_company;
  insert into stores(company_id,name,created_by) values(v_company,trim(p_store_name),auth.uid()) returning id into v_store;
  insert into roles(company_id,name,code,created_by) values(v_company,'Administrateur','company_admin',auth.uid()) returning id into v_role;
  insert into memberships(company_id,user_id,role_id,store_id,created_by) values(v_company,auth.uid(),v_role,v_store,auth.uid());
  select id into v_plan from subscription_plans where code='basic';
  insert into subscriptions(company_id,plan_id,status,trial_ends_at,current_period_ends_at,created_by) values(v_company,v_plan,'trialing',now()+interval '14 days',now()+interval '14 days',auth.uid());
  return v_company;
end $$;

create or replace function public.get_my_context() returns table(membership_id uuid, company_id uuid, company_name text, store_id uuid, role app_role, permissions text[], subscription_status subscription_status) language sql stable security definer set search_path=public as $$
select null::uuid,null::uuid,'Plateforme StockMaster'::text,null::uuid,'super_admin'::app_role,array[]::text[],null::subscription_status where public.is_super_admin()
union all
select m.id,m.company_id,c.name,m.store_id,r.code,coalesce(array_agg(p.code) filter(where p.code is not null),array[]::text[]),s.status from memberships m join companies c on c.id=m.company_id join roles r on r.id=m.role_id left join role_permissions rp on rp.role_id=r.id left join permissions p on p.id=rp.permission_id left join lateral(select status from subscriptions where company_id=m.company_id order by created_at desc limit 1)s on true where m.user_id=auth.uid() and m.is_active and not public.is_super_admin() group by m.id,c.name,r.code,s.status limit 1 $$;

insert into subscription_plans(code,name,monthly_price,annual_price,features) values
('basic','Basic',19,190,'{}'),('pro','Pro',49,490,'{}'),('premium','Premium',99,990,'{"reports":true,"expenses":true,"exports":true,"multi_store":true,"advanced_stats":true}') on conflict do nothing;
insert into permissions(code,description) values ('products.read','Consulter les produits'),('products.write','Gérer les produits'),('sales.read','Consulter les ventes'),('sales.write','Enregistrer des ventes'),('stock_movements.read','Consulter le stock'),('stock_movements.write','Gérer le stock'),('daily_reports.read','Consulter les rapports journaliers'),('monthly_reports.read','Consulter les rapports mensuels'),('memberships.write','Gérer les employés') on conflict do nothing;

-- RLS: deny by default, then allow only authenticated tenant members. Writes also require subscription + permission.
alter table profiles enable row level security;
create policy profiles_self_or_super on profiles for select to authenticated using(id=auth.uid() or public.is_super_admin());
create policy profiles_update_self on profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
alter table companies enable row level security;
create policy companies_tenant_select on companies for select to authenticated using(public.belongs_to_company(id));
create policy companies_admin_update on companies for update to authenticated using(public.has_permission(id,'company.manage') and public.has_active_subscription(id));

do $$ declare t text; begin foreach t in array array['stores','warehouses','roles','permissions','role_permissions','memberships','subscription_plans','subscriptions','payments','categories','products','product_variants','suppliers','customers','stock_movements','sales','sale_items','purchases','purchase_items','expenses','transfers','transfer_items','inventories','inventory_items','notifications','daily_reports','monthly_reports','audit_logs'] loop
  execute format('alter table public.%I enable row level security',t);
  if t in ('permissions','subscription_plans') then
    execute format('create policy %I on public.%I for select to authenticated using(true)',t||'_authenticated_read',t);
  else
    execute format('create policy %I on public.%I for select to authenticated using(public.belongs_to_company(company_id) and public.has_permission(company_id,%L))',t||'_tenant_select',t,t||'.read');
    execute format('create policy %I on public.%I for insert to authenticated with check(public.belongs_to_company(company_id) and public.has_active_subscription(company_id) and public.has_permission(company_id,%L))',t||'_tenant_insert',t,t||'.write');
    execute format('create policy %I on public.%I for update to authenticated using(public.belongs_to_company(company_id) and public.has_active_subscription(company_id) and public.has_permission(company_id,%L)) with check(public.belongs_to_company(company_id) and public.has_active_subscription(company_id))',t||'_tenant_update',t,t||'.write');
    execute format('create policy %I on public.%I for delete to authenticated using(public.belongs_to_company(company_id) and public.has_active_subscription(company_id) and public.has_permission(company_id,%L))',t||'_tenant_delete',t,t||'.write');
  end if;
end loop; end $$;

grant execute on function public.bootstrap_company(text,text) to authenticated;
grant execute on function public.get_my_context() to authenticated;
revoke all on function public.bootstrap_company(text,text) from anon;
