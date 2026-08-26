-- Clear and enforce the commercial boundary between Basic, Pro and Business.
-- The historical technical code "premium" is retained for compatibility, while
-- its customer-facing name becomes "Business".

update public.plans set
  name = case code when 'basic' then 'Basic' when 'pro' then 'Pro' when 'premium' then 'Business' else name end,
  description = case code
    when 'basic' then 'Une boutique avec les outils essentiels de vente et de gestion.'
    when 'pro' then 'Multi-boutiques, opérations avancées, exports et rapports détaillés.'
    when 'premium' then 'Multi-entreprises, contrôles avancés et accompagnement prioritaire.'
    else description end,
  max_businesses = case code when 'premium' then 10 else 1 end,
  max_stores = case code when 'basic' then 1 when 'pro' then 5 when 'premium' then 20 else max_stores end,
  max_employees = case code when 'basic' then 2 when 'pro' then 15 when 'premium' then 100 else max_employees end,
  updated_at = now()
where code in ('basic','pro','premium');

insert into public.plan_features(plan_id,feature_key,is_enabled,usage_limit)
select p.id, f.feature_key,
  case
    when f.tier = 'all' then true
    when f.tier = 'pro' then p.code in ('pro','premium')
    when f.tier = 'business' then p.code = 'premium'
    else false
  end,
  null
from public.plans p
cross join (values
  ('inventory','all'),
  ('sales','all'),
  ('expenses','all'),
  ('basic_reports','all'),
  ('receipts','all'),
  ('customers_suppliers','all'),
  ('offline_mode','all'),
  ('advanced_reports','pro'),
  ('pdf_export','pro'),
  ('excel_export','pro'),
  ('multi_store','pro'),
  ('inventory_count','pro'),
  ('transfers','pro'),
  ('advanced_permissions','pro'),
  ('notifications','pro'),
  ('multi_business','business'),
  ('expense_approval','business'),
  ('consolidated_reports','business'),
  ('audit_log','business'),
  ('priority_support','business')
) as f(feature_key,tier)
where p.code in ('basic','pro','premium')
on conflict(plan_id,feature_key) do update set
  is_enabled=excluded.is_enabled,
  usage_limit=excluded.usage_limit,
  updated_at=now();

-- A downgraded company cannot retain a Business-only approval threshold.
update public.companies c set expense_approval_threshold=null,updated_at=now()
where expense_approval_threshold is not null
and not exists (
  select 1 from public.subscriptions s
  join public.plans p on p.id=s.plan_id and p.code='premium' and p.is_active
  where s.company_id=c.id and (
    s.status in ('trialing','active') and coalesce(s.expires_at,s.current_period_ends_at,s.trial_ends_at)>now()
    or s.status='past_due' and s.grace_period_ends_at>now()
  )
);

create or replace function public.enforce_transfer_plan_feature()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.require_feature(new.company_id,'transfers');
  return new;
end $$;
drop trigger if exists enforce_transfer_plan_feature on public.transfers;
create trigger enforce_transfer_plan_feature before insert on public.transfers
for each row execute function public.enforce_transfer_plan_feature();

create or replace function public.enforce_inventory_count_plan_feature()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.require_feature(new.company_id,'inventory_count');
  return new;
end $$;
drop trigger if exists enforce_inventory_count_plan_feature on public.inventories;
create trigger enforce_inventory_count_plan_feature before insert on public.inventories
for each row execute function public.enforce_inventory_count_plan_feature();

create or replace function public.enforce_expense_approval_plan_feature()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.expense_approval_threshold is not null
    and new.expense_approval_threshold is distinct from old.expense_approval_threshold then
    perform public.require_feature(new.id,'expense_approval');
  end if;
  return new;
end $$;
drop trigger if exists enforce_expense_approval_plan_feature on public.companies;
create trigger enforce_expense_approval_plan_feature
before update of expense_approval_threshold on public.companies
for each row execute function public.enforce_expense_approval_plan_feature();

create or replace function public.create_employee_role(p_company_id uuid,p_name text,p_permission_codes text[])
returns uuid language plpgsql security definer set search_path=public as $$
declare v_role uuid;
begin
  if not public.is_business_owner(p_company_id) or not public.has_active_subscription(p_company_id) then raise exception 'Accès refusé ou abonnement inactif'; end if;
  perform public.require_feature(p_company_id,'advanced_permissions');
  insert into roles(company_id,name,code,created_by) values(p_company_id,trim(p_name),'employee',auth.uid()) returning id into v_role;
  insert into role_permissions(company_id,role_id,permission_id,created_by)
  select p_company_id,v_role,p.id,auth.uid() from permissions p where p.code=any(p_permission_codes);
  return v_role;
end $$;

create or replace function public.update_employee_role(p_role_id uuid,p_name text,p_permission_codes text[])
returns void language plpgsql security definer set search_path=public as $$
declare v_company uuid;
begin
  select company_id into v_company from roles where id=p_role_id and code='employee';
  if v_company is null or not public.has_permission(v_company,'roles.write') or not public.has_active_subscription(v_company) then raise exception 'Accès refusé'; end if;
  perform public.require_feature(v_company,'advanced_permissions');
  update roles set name=trim(p_name) where id=p_role_id;
  delete from role_permissions where role_id=p_role_id;
  insert into role_permissions(company_id,role_id,permission_id,created_by)
  select v_company,p_role_id,p.id,auth.uid() from permissions p where p.code=any(p_permission_codes);
end $$;

comment on table public.plan_features is 'Server-authoritative entitlements for Basic, Pro and Business plans.';
