-- StockMaster access, traceability and immutability baseline.

-- A Super Admin manages the platform through dedicated RPCs. It is not a
-- tenant member and must not inherit client application access implicitly.
create or replace function public.is_business_owner(p_company uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.client_businesses cb
    join public.companies c on c.id=cb.company_id and c.is_active
    where cb.client_id=auth.uid() and cb.company_id=p_company
  )
$$;

create or replace function public.belongs_to_company(p_company uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_business_owner(p_company) or exists(
    select 1 from public.memberships m
    join public.companies c on c.id=m.company_id and c.is_active
    where m.user_id=auth.uid() and m.company_id=p_company and m.is_active
  )
$$;

create or replace function public.is_company_admin(p_company_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.memberships m join public.roles r on r.id=m.role_id
    join public.companies c on c.id=m.company_id and c.is_active
    where m.user_id=auth.uid() and m.company_id=p_company_id and m.is_active
      and r.code='company_admin'
  )
$$;

create or replace function public.can_access_store(p_company uuid,p_store uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_business_owner(p_company) or exists(
    select 1 from public.memberships m
    join public.companies c on c.id=m.company_id and c.is_active
    where m.user_id=auth.uid() and m.company_id=p_company and m.is_active
      and (m.all_stores or m.store_id=p_store or exists(
        select 1 from public.membership_stores ms
        where ms.membership_id=m.id and ms.store_id=p_store and ms.company_id=p_company
      ))
  )
$$;

create or replace function public.has_permission(p_company uuid,p_code text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.memberships m
    join public.companies c on c.id=m.company_id and c.is_active
    join public.roles r on r.id=m.role_id
    left join public.role_permissions rp on rp.role_id=r.id
    left join public.permissions p on p.id=rp.permission_id
    where m.user_id=auth.uid() and m.company_id=p_company and m.is_active
      and (
        r.code='company_admin'
        or p.code=p_code
        or (p_code like '%.read' and p.code=regexp_replace(p_code,'\.read$','.write'))
      )
  )
$$;

create or replace function public.has_active_subscription(p_company uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.subscriptions s
    join public.companies c on c.id=s.company_id and c.is_active
    where s.company_id=p_company and (
      (s.status in ('trialing','active') and coalesce(s.expires_at,s.current_period_ends_at,s.trial_ends_at)>now())
      or (s.status='past_due' and s.grace_period_ends_at>now())
    )
  )
$$;

-- Platform data remains readable by Super Admin without exposing tenant stock,
-- sales, customers or other commercial tables.
drop policy if exists audit_logs_super_admin_read on public.audit_logs;
create policy audit_logs_super_admin_read on public.audit_logs for select to authenticated
using(public.is_super_admin());
drop policy if exists subscriptions_super_admin_read on public.subscriptions;
create policy subscriptions_super_admin_read on public.subscriptions for select to authenticated
using(public.is_super_admin());

-- Activity history is append-only for every authenticated user.
drop policy if exists audit_logs_tenant_insert on public.audit_logs;
drop policy if exists audit_logs_tenant_update on public.audit_logs;
drop policy if exists audit_logs_tenant_delete on public.audit_logs;
revoke insert,update,delete on public.audit_logs from anon,authenticated;
grant select on public.audit_logs to authenticated;

-- Financial and stock history can only change through audited RPCs.
drop policy if exists sales_tenant_insert on public.sales;
drop policy if exists sales_tenant_update on public.sales;
drop policy if exists sales_tenant_delete on public.sales;
drop policy if exists expenses_scoped_update on public.expenses;
drop policy if exists expenses_scoped_delete on public.expenses;
drop policy if exists cash_transactions_update on public.cash_transactions;
drop policy if exists cash_transactions_delete on public.cash_transactions;
drop policy if exists stock_movements_tenant_insert on public.stock_movements;
drop policy if exists stock_movements_tenant_update on public.stock_movements;
drop policy if exists stock_movements_tenant_delete on public.stock_movements;
drop policy if exists purchases_tenant_insert on public.purchases;
drop policy if exists purchases_tenant_update on public.purchases;
drop policy if exists purchases_tenant_delete on public.purchases;
drop policy if exists purchase_items_tenant_insert on public.purchase_items;
drop policy if exists purchase_items_tenant_update on public.purchase_items;
drop policy if exists purchase_items_tenant_delete on public.purchase_items;
drop policy if exists transfers_tenant_insert on public.transfers;
drop policy if exists transfers_tenant_update on public.transfers;
drop policy if exists transfers_tenant_delete on public.transfers;
drop policy if exists transfer_items_tenant_insert on public.transfer_items;
drop policy if exists transfer_items_tenant_update on public.transfer_items;
drop policy if exists transfer_items_tenant_delete on public.transfer_items;
revoke insert,update,delete on public.sales,public.sale_items,public.stock_levels,
  public.stock_movements,public.purchases,public.purchase_items,public.transfers,
  public.transfer_items from anon,authenticated;
revoke update,delete on public.expenses,public.cash_transactions from anon,authenticated;

-- Catalogue records with history are archived, never hard-deleted by clients.
drop policy if exists products_store_delete on public.products;
drop policy if exists categories_store_delete on public.categories;
drop policy if exists product_variants_tenant_delete on public.product_variants;
revoke delete on public.products,public.categories,public.product_variants from anon,authenticated;

create or replace function public.archive_product(p_product_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_company uuid;v_store uuid;
begin
  select company_id,store_id into v_company,v_store from public.products where id=p_product_id for update;
  if v_company is null or not public.can_access_store(v_company,v_store)
     or not public.has_active_subscription(v_company)
     or not public.has_permission(v_company,'products.write') then raise exception 'Archivage refusé';end if;
  update public.products set is_active=false where id=p_product_id;
  insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by)
  values(v_company,auth.uid(),'archive_product','products',p_product_id,jsonb_build_object('store_id',v_store),auth.uid());
end $$;

create or replace function public.archive_product_variant(p_variant_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_company uuid;v_store uuid;
begin
  select v.company_id,p.store_id into v_company,v_store from public.product_variants v
    join public.products p on p.id=v.product_id where v.id=p_variant_id for update of v;
  if v_company is null or not public.can_access_store(v_company,v_store)
     or not public.has_active_subscription(v_company)
     or not public.has_permission(v_company,'products.write') then raise exception 'Archivage refusé';end if;
  update public.product_variants set is_active=false where id=p_variant_id;
  insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by)
  values(v_company,auth.uid(),'archive_product_variant','product_variants',p_variant_id,jsonb_build_object('store_id',v_store),auth.uid());
end $$;

-- Manual stock corrections always require an identifiable reason.
create or replace function public.require_stock_adjustment_reason()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.movement_type in ('adjustment_in','adjustment_out') and length(trim(coalesce(new.note,'')))<3 then
    raise exception 'Le motif de la correction de stock est obligatoire';
  end if;
  return new;
end $$;
drop trigger if exists require_stock_adjustment_reason on public.stock_movements;
create trigger require_stock_adjustment_reason before insert on public.stock_movements
for each row execute function public.require_stock_adjustment_reason();

-- Purchase price changes are separate from ordinary product editing and are audited.
insert into public.permissions(code,description) values
  ('products.purchase_price.update','Modifier le prix d’achat'),
  ('sales.refund','Valider un remboursement'),
  ('sales.export','Exporter les ventes'),
  ('reports.financial','Consulter les bénéfices et marges')
on conflict(code) do update set description=excluded.description;

create or replace function public.audit_product_price_change()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is not null and new.purchase_price is distinct from old.purchase_price
     and not public.is_company_admin(new.company_id)
     and not public.has_permission(new.company_id,'products.purchase_price.update') then
    raise exception 'Vous ne pouvez pas modifier le prix d’achat';
  end if;
  if auth.uid() is not null and (new.purchase_price is distinct from old.purchase_price or new.sale_price is distinct from old.sale_price) then
    insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by)
    values(new.company_id,auth.uid(),'change_product_price','products',new.id,
      jsonb_build_object('purchase_before',old.purchase_price,'purchase_after',new.purchase_price,
        'sale_before',old.sale_price,'sale_after',new.sale_price),auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists audit_product_price_change on public.products;
create trigger audit_product_price_change before update of purchase_price,sale_price on public.products
for each row execute function public.audit_product_price_change();

create or replace function public.audit_variant_price_change()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is not null and new.purchase_price is distinct from old.purchase_price
     and not public.is_company_admin(new.company_id)
     and not public.has_permission(new.company_id,'products.purchase_price.update') then
    raise exception 'Vous ne pouvez pas modifier le prix d’achat';
  end if;
  if auth.uid() is not null and (new.purchase_price is distinct from old.purchase_price or new.sale_price is distinct from old.sale_price) then
    insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by)
    values(new.company_id,auth.uid(),'change_variant_price','product_variants',new.id,
      jsonb_build_object('purchase_before',old.purchase_price,'purchase_after',new.purchase_price,
        'sale_before',old.sale_price,'sale_after',new.sale_price),auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists audit_variant_price_change on public.product_variants;
create trigger audit_variant_price_change before update of purchase_price,sale_price on public.product_variants
for each row execute function public.audit_variant_price_change();

-- Only a company owner/admin may manage employees. Historical users are
-- deactivated instead of deleted.
create or replace function public.update_employee_access(
  p_membership_id uuid,p_role_id uuid,p_store_ids uuid[],p_all_stores boolean,p_is_active boolean
) returns void language plpgsql security definer set search_path=public as $$
declare v_company uuid;v_user uuid;v_before jsonb;
begin
  select m.company_id,m.user_id,to_jsonb(m) into v_company,v_user,v_before
  from public.memberships m join public.roles r on r.id=m.role_id
  where m.id=p_membership_id and r.code='employee';
  if v_company is null or not (public.is_business_owner(v_company) or public.is_company_admin(v_company)) then raise exception 'Accès Administrateur requis';end if;
  if v_user=auth.uid() then raise exception 'Vous ne pouvez pas modifier votre propre rôle';end if;
  if not exists(select 1 from public.roles where id=p_role_id and company_id=v_company and code='employee') then raise exception 'Rôle employé invalide';end if;
  if not p_all_stores and cardinality(coalesce(p_store_ids,array[]::uuid[]))=0 then raise exception 'Choisissez au moins une boutique';end if;
  if exists(select 1 from unnest(coalesce(p_store_ids,array[]::uuid[])) sid where not exists(select 1 from public.stores s where s.id=sid and s.company_id=v_company and s.is_active)) then raise exception 'Boutique invalide';end if;
  update public.memberships set role_id=p_role_id,all_stores=p_all_stores,
    store_id=case when p_all_stores then null else p_store_ids[1] end,is_active=p_is_active
  where id=p_membership_id;
  delete from public.membership_stores where membership_id=p_membership_id;
  if not p_all_stores then
    insert into public.membership_stores(company_id,membership_id,store_id,created_by)
    select v_company,p_membership_id,sid,auth.uid() from unnest(p_store_ids) sid;
  end if;
  insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by)
  values(v_company,auth.uid(),'update_employee_access','memberships',p_membership_id,
    jsonb_build_object('before',v_before,'role_id',p_role_id,'store_ids',p_store_ids,'all_stores',p_all_stores,'is_active',p_is_active),auth.uid());
end $$;

create or replace function public.delete_employee(p_membership_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_company uuid;v_user uuid;v_has_history boolean;
begin
  select m.company_id,m.user_id into v_company,v_user from public.memberships m
  join public.roles r on r.id=m.role_id where m.id=p_membership_id and r.code='employee';
  if v_company is null or not (public.is_business_owner(v_company) or public.is_company_admin(v_company)) then raise exception 'Accès Administrateur requis';end if;
  if v_user=auth.uid() then raise exception 'Vous ne pouvez pas supprimer votre propre accès';end if;
  select exists(select 1 from public.sales where created_by=v_user and company_id=v_company)
    or exists(select 1 from public.expenses where created_by=v_user and company_id=v_company)
    or exists(select 1 from public.cash_transactions where created_by=v_user and company_id=v_company)
    or exists(select 1 from public.stock_movements where created_by=v_user and company_id=v_company)
    or exists(select 1 from public.purchases where created_by=v_user and company_id=v_company)
    or exists(select 1 from public.supplier_payments where created_by=v_user and company_id=v_company)
    or exists(select 1 from public.customer_ledger where created_by=v_user and company_id=v_company)
    or exists(select 1 from public.sale_returns where created_by=v_user and company_id=v_company)
  into v_has_history;
  if v_has_history then
    update public.memberships set is_active=false where id=p_membership_id;
    insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by)
    values(v_company,auth.uid(),'deactivate_historical_employee','memberships',p_membership_id,jsonb_build_object('user_id',v_user),auth.uid());
  else
    delete from public.memberships where id=p_membership_id;
    insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by)
    values(v_company,auth.uid(),'delete_unused_employee','memberships',p_membership_id,jsonb_build_object('user_id',v_user),auth.uid());
  end if;
end $$;

-- Suspension history: reason, date and author are mandatory and immutable.
create table if not exists public.company_status_events(
  id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id) on delete cascade,
  was_active boolean not null,is_active boolean not null,reason text not null,
  changed_by uuid not null references public.profiles(id),created_at timestamptz not null default now()
);
alter table public.company_status_events enable row level security;
drop policy if exists company_status_events_super_read on public.company_status_events;
create policy company_status_events_super_read on public.company_status_events for select to authenticated using(public.is_super_admin());
revoke insert,update,delete on public.company_status_events from anon,authenticated;
grant select on public.company_status_events to authenticated;

drop function if exists public.set_company_active(uuid,boolean);
create function public.set_company_active(p_company_id uuid,p_active boolean,p_reason text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_before boolean;
begin
  if not public.is_super_admin() then raise exception 'Accès Super Admin requis';end if;
  select is_active into v_before from public.companies where id=p_company_id for update;
  if v_before is null then raise exception 'Entreprise introuvable';end if;
  if not p_active and length(trim(coalesce(p_reason,'')))<3 then raise exception 'La raison de la suspension est obligatoire';end if;
  if v_before=p_active then return;end if;
  update public.companies set is_active=p_active where id=p_company_id;
  insert into public.company_status_events(company_id,was_active,is_active,reason,changed_by)
  values(p_company_id,v_before,p_active,coalesce(nullif(trim(p_reason),''),'Réactivation autorisée'),auth.uid());
  insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by)
  values(p_company_id,auth.uid(),case when p_active then 'reactivate_company' else 'suspend_company' end,
    'companies',p_company_id,jsonb_build_object('reason',coalesce(nullif(trim(p_reason),''),'Réactivation autorisée')),auth.uid());
end $$;

grant execute on function public.archive_product(uuid),public.archive_product_variant(uuid),
  public.update_employee_access(uuid,uuid,uuid[],boolean,boolean),public.delete_employee(uuid),
  public.set_company_active(uuid,boolean,text) to authenticated;
revoke all on function public.archive_product(uuid),public.archive_product_variant(uuid),
  public.update_employee_access(uuid,uuid,uuid[],boolean,boolean),public.delete_employee(uuid),
  public.set_company_active(uuid,boolean,text) from anon;

do $$begin alter publication supabase_realtime add table public.role_permissions;
exception when duplicate_object then null;end $$;
do $$begin alter publication supabase_realtime add table public.membership_stores;
exception when duplicate_object then null;end $$;
