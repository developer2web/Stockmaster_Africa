-- Enterprise country/currency configuration with immutable transaction snapshots.

create table public.country_currency_map (
  country_code char(2) primary key check(country_code=upper(country_code)),
  country_name text not null,
  default_currency_code char(3) not null check(default_currency_code=upper(default_currency_code)),
  allowed_currency_codes text[] not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(default_currency_code=any(allowed_currency_codes))
);
insert into public.country_currency_map(
  country_code,country_name,default_currency_code,allowed_currency_codes
) values
  ('GN','Guinée','GNF',array['GNF','USD','EUR']),
  ('SN','Sénégal','XOF',array['XOF','EUR','USD']),
  ('CI','Côte d''Ivoire','XOF',array['XOF','EUR','USD']),
  ('ML','Mali','XOF',array['XOF','EUR','USD']),
  ('CM','Cameroun','XAF',array['XAF','EUR','USD']),
  ('US','États-Unis','USD',array['USD','CAD','EUR']),
  ('CA','Canada','CAD',array['CAD','USD','EUR']),
  ('FR','France','EUR',array['EUR','USD','GBP']),
  ('GB','Royaume-Uni','GBP',array['GBP','EUR','USD'])
on conflict(country_code) do update set
  country_name=excluded.country_name,
  default_currency_code=excluded.default_currency_code,
  allowed_currency_codes=excluded.allowed_currency_codes,
  is_active=true,
  updated_at=now();
alter table public.companies
  add column country_code char(2),
  add column country_name text,
  add column default_currency_code char(3),
  add column secondary_currency_code char(3),
  add column currency_locked_at timestamptz;
update public.companies set
  country_code='CA',
  country_name='Canada',
  default_currency_code='CAD'
where country_code is null;
alter table public.companies
  alter column country_code set not null,
  alter column country_name set not null,
  alter column default_currency_code set not null,
  add constraint companies_country_currency_fkey
    foreign key(country_code) references public.country_currency_map(country_code),
  add constraint companies_secondary_differs
    check(secondary_currency_code is null or secondary_currency_code<>default_currency_code);
create table public.currency_exchange_rates (
  id uuid primary key default gen_random_uuid(),
  base_currency_code char(3) not null,
  quote_currency_code char(3) not null,
  rate numeric(24,10) not null check(rate>0),
  provider text not null,
  effective_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(base_currency_code,quote_currency_code,effective_at),
  check(base_currency_code<>quote_currency_code)
);
create index currency_rates_latest_idx on public.currency_exchange_rates(
  base_currency_code,quote_currency_code,effective_at desc
);
create table public.currency_change_audit (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  old_country_code char(2),
  new_country_code char(2) not null,
  old_primary_currency_code char(3),
  new_primary_currency_code char(3) not null,
  old_secondary_currency_code char(3),
  new_secondary_currency_code char(3),
  exceptional boolean not null default false,
  reason text,
  created_at timestamptz not null default now()
);
alter table public.country_currency_map enable row level security;
alter table public.currency_exchange_rates enable row level security;
alter table public.currency_change_audit enable row level security;
create policy country_currency_authenticated_read
on public.country_currency_map for select to authenticated using(is_active);
create policy exchange_rates_authenticated_read
on public.currency_exchange_rates for select to authenticated using(true);
create policy currency_audit_owner_read
on public.currency_change_audit for select to authenticated
using(public.is_business_owner(company_id) or public.is_super_admin());
-- Rates are written only by a trusted service-role synchronization function.
revoke insert,update,delete on public.currency_exchange_rates from anon,authenticated;
revoke insert,update,delete on public.country_currency_map from anon,authenticated;
alter table public.sales
  add column currency_code char(3),
  add column secondary_currency_code char(3),
  add column secondary_exchange_rate numeric(24,10),
  add column exchange_rate_effective_at timestamptz;
alter table public.expenses
  add column currency_code char(3),
  add column secondary_currency_code char(3),
  add column secondary_exchange_rate numeric(24,10),
  add column exchange_rate_effective_at timestamptz;
alter table public.cash_transactions
  add column currency_code char(3),
  add column secondary_currency_code char(3),
  add column secondary_exchange_rate numeric(24,10),
  add column exchange_rate_effective_at timestamptz;
update public.sales s set currency_code=c.default_currency_code
from companies c where c.id=s.company_id and s.currency_code is null;
update public.expenses e set currency_code=c.default_currency_code
from companies c where c.id=e.company_id and e.currency_code is null;
update public.cash_transactions ct set currency_code=c.default_currency_code
from companies c where c.id=ct.company_id and ct.currency_code is null;
alter table public.sales alter column currency_code set not null;
alter table public.expenses alter column currency_code set not null;
alter table public.cash_transactions alter column currency_code set not null;
create or replace function public.protect_company_currency()
returns trigger language plpgsql set search_path=public as $$
begin
  if (
    new.country_code,
    new.default_currency_code,
    new.secondary_currency_code
  ) is distinct from (
    old.country_code,
    old.default_currency_code,
    old.secondary_currency_code
  ) and current_setting('app.currency_change_authorized',true)<>'yes' then
    raise exception 'Utilisez la configuration de devise sécurisée';
  end if;
  return new;
end $$;
create trigger protect_company_currency
before update of country_code,default_currency_code,secondary_currency_code
on public.companies for each row execute function public.protect_company_currency();
create or replace function public.snapshot_transaction_currency()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_primary char(3);
  v_secondary char(3);
  v_rate numeric;
  v_effective timestamptz;
begin
  select default_currency_code,secondary_currency_code
  into v_primary,v_secondary
  from companies where id=new.company_id;
  if v_primary is null then raise exception 'Devise de l''entreprise absente'; end if;

  new.currency_code:=v_primary;
  new.secondary_currency_code:=v_secondary;
  if v_secondary is not null then
    select rate,effective_at into v_rate,v_effective
    from currency_exchange_rates
    where base_currency_code=v_primary and quote_currency_code=v_secondary
      and effective_at<=coalesce(new.created_at,now())
    order by effective_at desc limit 1;
    new.secondary_exchange_rate:=v_rate;
    new.exchange_rate_effective_at:=v_effective;
  else
    new.secondary_exchange_rate:=null;
    new.exchange_rate_effective_at:=null;
  end if;
  return new;
end $$;
create trigger snapshot_sale_currency before insert on public.sales
for each row execute function public.snapshot_transaction_currency();
create trigger snapshot_expense_currency before insert on public.expenses
for each row execute function public.snapshot_transaction_currency();
create trigger snapshot_cash_currency before insert on public.cash_transactions
for each row execute function public.snapshot_transaction_currency();
create or replace function public.protect_transaction_currency_snapshot()
returns trigger language plpgsql set search_path=public as $$
begin
  if (
    new.currency_code,new.secondary_currency_code,new.secondary_exchange_rate,
    new.exchange_rate_effective_at
  ) is distinct from (
    old.currency_code,old.secondary_currency_code,old.secondary_exchange_rate,
    old.exchange_rate_effective_at
  ) then
    raise exception 'L''instantané monétaire d''une transaction est immuable';
  end if;
  return new;
end $$;
create trigger protect_sale_currency_snapshot
before update of currency_code,secondary_currency_code,secondary_exchange_rate,exchange_rate_effective_at
on public.sales for each row execute function public.protect_transaction_currency_snapshot();
create trigger protect_expense_currency_snapshot
before update of currency_code,secondary_currency_code,secondary_exchange_rate,exchange_rate_effective_at
on public.expenses for each row execute function public.protect_transaction_currency_snapshot();
create trigger protect_cash_currency_snapshot
before update of currency_code,secondary_currency_code,secondary_exchange_rate,exchange_rate_effective_at
on public.cash_transactions for each row execute function public.protect_transaction_currency_snapshot();
create or replace function public.lock_currency_after_sale()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  update companies set currency_locked_at=coalesce(currency_locked_at,new.created_at)
  where id=new.company_id and currency_locked_at is null;
  return new;
end $$;
create trigger lock_company_currency_after_sale
after insert on public.sales for each row execute function public.lock_currency_after_sale();
create or replace function public.set_business_currency(
  p_company_id uuid,
  p_country_code text,
  p_primary_currency_code text default null,
  p_secondary_currency_code text default null,
  p_reason text default null
) returns void
language plpgsql security definer set search_path=public as $$
declare
  v_map country_currency_map%rowtype;
  v_company companies%rowtype;
  v_secondary text:=nullif(upper(trim(p_secondary_currency_code)),'');
  v_primary text;
  v_exceptional boolean;
begin
  select * into v_company from companies where id=p_company_id for update;
  if not found then raise exception 'Entreprise introuvable'; end if;
  v_exceptional:=public.is_super_admin();
  if not v_exceptional and not public.is_business_owner(p_company_id) then
    raise exception 'Seul le propriétaire peut modifier la devise';
  end if;
  if v_company.currency_locked_at is not null and not v_exceptional then
    raise exception 'La devise est verrouillée depuis la première vente';
  end if;
  if v_exceptional and v_company.currency_locked_at is not null
    and length(trim(coalesce(p_reason,'')))<10 then
    raise exception 'Une justification détaillée est requise';
  end if;

  select * into v_map from country_currency_map
  where country_code=upper(trim(p_country_code)) and is_active;
  if not found then raise exception 'Pays non pris en charge'; end if;
  v_primary:=coalesce(nullif(upper(trim(p_primary_currency_code)),''),v_map.default_currency_code);
  if not v_primary=any(v_map.allowed_currency_codes) then
    raise exception 'Devise principale non autorisée pour ce pays';
  end if;
  if v_secondary is not null and not v_secondary=any(v_map.allowed_currency_codes) then
    raise exception 'Devise secondaire non autorisée pour ce pays';
  end if;
  if v_secondary=v_primary then v_secondary:=null; end if;

  perform set_config('app.currency_change_authorized','yes',true);
  update companies set
    country_code=v_map.country_code,
    country_name=v_map.country_name,
    default_currency_code=v_primary,
    secondary_currency_code=v_secondary
  where id=p_company_id;

  insert into currency_change_audit(
    company_id,actor_id,old_country_code,new_country_code,
    old_primary_currency_code,new_primary_currency_code,
    old_secondary_currency_code,new_secondary_currency_code,exceptional,reason
  ) values(
    p_company_id,auth.uid(),v_company.country_code,v_map.country_code,
    v_company.default_currency_code,v_primary,
    v_company.secondary_currency_code,v_secondary,v_exceptional,nullif(trim(p_reason),'')
  );
end $$;
grant execute on function public.set_business_currency(uuid,text,text,text,text) to authenticated;
revoke all on function public.set_business_currency(uuid,text,text,text,text) from anon;
-- Country-aware business creation. Legacy overloads remain for old clients and
-- default to Canada until those clients are upgraded.
create or replace function public.create_business(
  p_company_name text,p_store_name text,p_country_code text
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_company uuid;v_store uuid;v_admin uuid;v_plan uuid;v_map country_currency_map%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(trim(p_company_name))<2 or length(trim(p_store_name))<2 then raise exception 'Nom invalide'; end if;
  select * into v_map from country_currency_map where country_code=upper(trim(p_country_code)) and is_active;
  if not found then raise exception 'Pays non pris en charge'; end if;
  insert into companies(name,country_code,country_name,default_currency_code,created_by)
  values(trim(p_company_name),v_map.country_code,v_map.country_name,v_map.default_currency_code,auth.uid())
  returning id into v_company;
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
create or replace function public.create_business(p_company_name text,p_store_name text)
returns uuid language sql security definer set search_path=public as $$
  select public.create_business(p_company_name,p_store_name,'CA')
$$;
create or replace function public.bootstrap_company(
  p_company_name text,p_store_name text,p_country_code text
) returns uuid language sql security definer set search_path=public as $$
  select public.create_business(p_company_name,p_store_name,p_country_code)
$$;
create or replace function public.bootstrap_company(p_company_name text,p_store_name text)
returns uuid language sql security definer set search_path=public as $$
  select public.create_business(p_company_name,p_store_name,'CA')
$$;
grant execute on function public.create_business(text,text,text) to authenticated;
grant execute on function public.bootstrap_company(text,text,text) to authenticated;
revoke all on function public.create_business(text,text,text) from anon;
revoke all on function public.bootstrap_company(text,text,text) from anon;
drop function public.get_accessible_businesses();
create function public.get_accessible_businesses()
returns table(
  company_id uuid,company_name text,membership_id uuid,role app_role,role_name text,
  subscription_status subscription_status,country_code text,country_name text,
  default_currency_code text,secondary_currency_code text,currency_locked_at timestamptz
) language sql stable security definer set search_path=public as $$
  select m.company_id,c.name,m.id,r.code,r.name,s.status,c.country_code::text,
    c.country_name,c.default_currency_code::text,c.secondary_currency_code::text,c.currency_locked_at
  from memberships m join companies c on c.id=m.company_id and c.is_active
  join roles r on r.id=m.role_id
  left join lateral(select status from subscriptions where company_id=m.company_id order by created_at desc limit 1)s on true
  where m.user_id=auth.uid() and m.is_active order by c.created_at
$$;
drop function public.get_workspace_context(uuid,uuid);
create function public.get_workspace_context(p_company_id uuid,p_store_id uuid)
returns table(
  membership_id uuid,company_id uuid,company_name text,store_id uuid,store_name text,
  role app_role,role_name text,permissions text[],subscription_status subscription_status,
  country_code text,country_name text,default_currency_code text,
  secondary_currency_code text,currency_locked_at timestamptz
) language sql stable security definer set search_path=public as $$
  select m.id,m.company_id,c.name,s.id,s.name,r.code,r.name,
    coalesce(array_agg(distinct p.code) filter(where p.code is not null),array[]::text[]),
    sub.status,c.country_code::text,c.country_name,c.default_currency_code::text,
    c.secondary_currency_code::text,c.currency_locked_at
  from memberships m join companies c on c.id=m.company_id and c.is_active
  join roles r on r.id=m.role_id
  join stores s on s.id=p_store_id and s.company_id=m.company_id and s.is_active
  left join role_permissions rp on rp.role_id=r.id left join permissions p on p.id=rp.permission_id
  left join lateral(select status from subscriptions where company_id=m.company_id order by created_at desc limit 1)sub on true
  where m.user_id=auth.uid() and m.is_active and m.company_id=p_company_id
    and public.can_access_store(m.company_id,s.id)
  group by m.id,c.name,s.id,s.name,r.code,r.name,sub.status,c.country_code,
    c.country_name,c.default_currency_code,c.secondary_currency_code,c.currency_locked_at
$$;
grant execute on function public.get_accessible_businesses() to authenticated;
grant execute on function public.get_workspace_context(uuid,uuid) to authenticated;
