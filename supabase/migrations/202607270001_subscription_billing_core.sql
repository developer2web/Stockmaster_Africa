-- Subscription, feature entitlement and provider-neutral Mobile Money core.

alter type public.subscription_status add value if not exists 'pending';
alter type public.subscription_status add value if not exists 'suspended';
alter type public.subscription_status add value if not exists 'cancelled';
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null default '',
  monthly_price numeric(14,2) not null check(monthly_price >= 0),
  annual_price numeric(14,2) not null check(annual_price >= 0),
  currency char(3) not null check(currency = upper(currency)),
  max_businesses integer not null check(max_businesses > 0),
  max_stores integer not null check(max_stores > 0),
  max_employees integer not null check(max_employees >= 0),
  ai_requests_limit integer not null default 0 check(ai_requests_limit >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.plans(
  id,code,name,description,monthly_price,annual_price,currency,
  max_businesses,max_stores,max_employees,ai_requests_limit,is_active
)
select
  id,
  code,
  name,
  case code
    when 'basic' then 'Stock, produits, ventes et rapports simples.'
    when 'pro' then 'Gestion avancée, exports, dépenses et notifications.'
    else 'Multi-entreprises et fonctions IA avancées.'
  end,
  monthly_price,
  annual_price,
  'CAD',
  case code when 'basic' then 1 when 'pro' then 3 else 10 end,
  case code when 'basic' then 1 when 'pro' then 5 else 20 end,
  case code when 'basic' then 2 when 'pro' then 15 else 100 end,
  case code when 'basic' then 0 when 'pro' then 30 else 500 end,
  is_active
from public.subscription_plans
on conflict(code) do update set
  name=excluded.name,
  description=excluded.description,
  monthly_price=excluded.monthly_price,
  annual_price=excluded.annual_price,
  max_businesses=excluded.max_businesses,
  max_stores=excluded.max_stores,
  max_employees=excluded.max_employees,
  ai_requests_limit=excluded.ai_requests_limit,
  is_active=excluded.is_active,
  updated_at=now();
create table public.plan_features (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  feature_key text not null,
  is_enabled boolean not null default false,
  usage_limit integer check(usage_limit is null or usage_limit >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(plan_id,feature_key)
);
insert into public.plan_features(plan_id,feature_key,is_enabled,usage_limit)
select p.id,features.feature_key,features.enabled,
  case when features.feature_key in ('ai_summary','ai_assistant') then p.ai_requests_limit else null end
from public.plans p
cross join lateral (
  values
    ('inventory',true),
    ('sales',true),
    ('expenses',p.code in ('pro','premium')),
    ('advanced_reports',p.code in ('pro','premium')),
    ('pdf_export',p.code in ('pro','premium')),
    ('excel_export',p.code in ('pro','premium')),
    ('notifications',p.code in ('pro','premium')),
    ('ai_summary',p.code in ('pro','premium')),
    ('ai_assistant',p.code='premium'),
    ('offline_mode',p.code='premium'),
    ('multi_business',p.code='premium'),
    ('multi_store',p.code in ('pro','premium'))
) as features(feature_key,enabled)
on conflict(plan_id,feature_key) do update set
  is_enabled=excluded.is_enabled,
  usage_limit=excluded.usage_limit,
  updated_at=now();
alter table public.subscriptions
  add column if not exists client_id uuid references public.profiles(id),
  add column if not exists payment_provider text,
  add column if not exists payment_reference text,
  add column if not exists billing_cycle text,
  add column if not exists starts_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists grace_period_ends_at timestamptz,
  add column if not exists auto_renew boolean not null default false;
update public.subscriptions s
set client_id=coalesce(
    (select cb.client_id from client_businesses cb where cb.company_id=s.company_id order by cb.is_primary desc limit 1),
    (select c.created_by from companies c where c.id=s.company_id)
  ),
  starts_at=coalesce(s.starts_at,s.created_at),
  expires_at=coalesce(s.expires_at,s.current_period_ends_at,s.trial_ends_at),
  grace_period_ends_at=coalesce(
    s.grace_period_ends_at,
    s.current_period_ends_at + interval '5 days',
    s.trial_ends_at + interval '5 days'
  ),
  billing_cycle=coalesce(s.billing_cycle,'monthly')
where client_id is null
   or starts_at is null
   or expires_at is null
   or billing_cycle is null;
alter table public.subscriptions
  drop constraint if exists subscriptions_plan_id_fkey;
alter table public.subscriptions
  add constraint subscriptions_plan_id_fkey
  foreign key(plan_id) references public.plans(id);
alter table public.subscriptions
  add constraint subscriptions_billing_cycle_check
  check(billing_cycle in ('monthly','annual'));
create index subscriptions_client_created_idx
  on public.subscriptions(client_id,created_at desc);
create unique index subscriptions_payment_reference_unique
  on public.subscriptions(payment_provider,payment_reference)
  where payment_reference is not null;
create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id),
  company_id uuid references public.companies(id) on delete set null,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  plan_id uuid not null references public.plans(id),
  provider text not null,
  provider_reference text,
  operation_id uuid not null,
  billing_cycle text not null check(billing_cycle in ('monthly','annual')),
  amount numeric(14,2) not null check(amount > 0),
  currency char(3) not null check(currency=upper(currency)),
  phone_number text,
  status text not null default 'pending'
    check(status in ('pending','processing','succeeded','failed','cancelled','expired')),
  provider_payload jsonb not null default '{}',
  failure_reason text,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(client_id,operation_id),
  unique(provider,provider_reference)
);
create table public.payment_status_log (
  id bigint generated always as identity primary key,
  payment_transaction_id uuid not null references public.payment_transactions(id) on delete cascade,
  old_status text,
  new_status text not null,
  source text not null,
  provider_event_id text,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(provider_event_id)
);
create table public.subscription_usage (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  feature_key text not null,
  used_count integer not null default 0 check(used_count >= 0),
  period_start timestamptz not null,
  period_end timestamptz not null,
  updated_at timestamptz not null default now(),
  unique(subscription_id,feature_key,period_start)
);
create trigger touch_updated_at before update on public.plans
for each row execute function public.touch_updated_at();
create trigger touch_updated_at before update on public.plan_features
for each row execute function public.touch_updated_at();
create trigger touch_updated_at before update on public.payment_transactions
for each row execute function public.touch_updated_at();
alter table public.plans enable row level security;
alter table public.plan_features enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.payment_status_log enable row level security;
alter table public.subscription_usage enable row level security;
create policy plans_public_read on public.plans for select to authenticated using(is_active);
create policy plan_features_public_read on public.plan_features for select to authenticated
using(exists(select 1 from plans p where p.id=plan_id and p.is_active));
create policy subscriptions_owner_read on public.subscriptions for select to authenticated
using(client_id=auth.uid() or public.is_super_admin());
create policy payment_transactions_owner_read on public.payment_transactions for select to authenticated
using(client_id=auth.uid() or public.is_super_admin());
create policy payment_status_owner_read on public.payment_status_log for select to authenticated
using(public.is_super_admin() or exists(
  select 1 from payment_transactions pt
  where pt.id=payment_transaction_id and pt.client_id=auth.uid()
));
create policy subscription_usage_owner_read on public.subscription_usage for select to authenticated
using(public.is_super_admin() or exists(
  select 1 from subscriptions s
  where s.id=subscription_id and s.client_id=auth.uid()
));
grant select on public.plans,public.plan_features,public.subscriptions,
  public.payment_transactions,public.payment_status_log,public.subscription_usage
to authenticated;
revoke insert,update,delete on public.plans,public.plan_features,public.subscriptions,
  public.payment_transactions,public.payment_status_log,public.subscription_usage
from anon,authenticated;
create or replace function public.current_subscription(p_company_id uuid default null)
returns table(
  subscription_id uuid,client_id uuid,plan_id uuid,plan_code text,plan_name text,
  status subscription_status,billing_cycle text,starts_at timestamptz,
  expires_at timestamptz,grace_period_ends_at timestamptz,
  is_read_only boolean,max_businesses integer,max_stores integer,max_employees integer
)
language sql stable security definer set search_path=public
as $$
  select s.id,s.client_id,p.id,p.code,p.name,s.status,s.billing_cycle,s.starts_at,
    s.expires_at,s.grace_period_ends_at,
    not (
      (
        s.status in ('trialing','active')
        and coalesce(s.expires_at,s.current_period_ends_at,s.trial_ends_at) > now()
      )
      or (
        s.status='past_due'
        and s.grace_period_ends_at > now()
      )
    ) as is_read_only,
    p.max_businesses,p.max_stores,p.max_employees
  from subscriptions s
  join plans p on p.id=s.plan_id and p.is_active
  where (
    (p_company_id is not null and s.company_id=p_company_id and public.belongs_to_company(p_company_id))
    or (p_company_id is null and s.client_id=auth.uid())
    or public.is_super_admin()
  )
  order by
    case when s.status in ('active','trialing') then 0 when s.status='past_due' then 1 else 2 end,
    s.created_at desc
  limit 1
$$;
create or replace function public.can_use_feature(p_company_id uuid,p_feature_key text)
returns boolean language sql stable security definer set search_path=public
as $$
  select public.is_super_admin() or coalesce((
    select pf.is_enabled
      and (
        s.status in ('trialing','active')
        and coalesce(s.expires_at,s.current_period_ends_at,s.trial_ends_at) > now()
        or s.status='past_due' and s.grace_period_ends_at > now()
      )
    from subscriptions s
    join plans p on p.id=s.plan_id and p.is_active
    join plan_features pf on pf.plan_id=p.id and pf.feature_key=p_feature_key
    where s.company_id=p_company_id and public.belongs_to_company(p_company_id)
    order by s.created_at desc
    limit 1
  ),false)
$$;
create or replace function public.require_feature(p_company_id uuid,p_feature_key text)
returns void language plpgsql stable security definer set search_path=public
as $$
begin
  if not public.can_use_feature(p_company_id,p_feature_key) then
    raise exception 'Fonctionnalité non incluse dans le forfait actif: %',p_feature_key
      using errcode='P0001';
  end if;
end
$$;
create or replace function public.has_active_subscription(p_company uuid)
returns boolean language sql stable security definer set search_path=public
as $$
  select public.is_super_admin() or exists(
    select 1 from subscriptions s
    join companies c on c.id=s.company_id and c.is_active
    where s.company_id=p_company
      and (
        s.status in ('trialing','active')
          and coalesce(s.expires_at,s.current_period_ends_at,s.trial_ends_at) > now()
        or s.status='past_due' and s.grace_period_ends_at > now()
      )
  )
$$;
create or replace function public.consume_subscription_usage(
  p_company_id uuid,p_feature_key text,p_amount integer default 1
) returns table(used_count integer,usage_limit integer)
language plpgsql security definer set search_path=public
as $$
declare
  v_subscription subscriptions%rowtype;
  v_limit integer;
  v_start timestamptz;
  v_end timestamptz;
  v_used integer;
begin
  if p_amount<=0 then raise exception 'Quantité d''usage invalide'; end if;
  perform public.require_feature(p_company_id,p_feature_key);

  select s.* into v_subscription from subscriptions s
  where s.company_id=p_company_id order by s.created_at desc limit 1 for update;
  select pf.usage_limit into v_limit from plan_features pf
  where pf.plan_id=v_subscription.plan_id and pf.feature_key=p_feature_key;

  v_start:=coalesce(v_subscription.starts_at,date_trunc('month',now()));
  v_end:=coalesce(v_subscription.expires_at,v_subscription.current_period_ends_at,v_start+interval '1 month');

  insert into subscription_usage(subscription_id,feature_key,used_count,period_start,period_end)
  values(v_subscription.id,p_feature_key,p_amount,v_start,v_end)
  on conflict(subscription_id,feature_key,period_start) do update
    set used_count=subscription_usage.used_count+excluded.used_count,updated_at=now()
  returning subscription_usage.used_count into v_used;

  if v_limit is not null and v_used>v_limit then
    raise exception 'Limite d''utilisation atteinte pour %',p_feature_key;
  end if;
  return query select v_used,v_limit;
end
$$;
grant execute on function public.current_subscription(uuid) to authenticated;
grant execute on function public.can_use_feature(uuid,text) to authenticated;
grant execute on function public.require_feature(uuid,text) to authenticated;
grant execute on function public.consume_subscription_usage(uuid,text,integer) to authenticated;
revoke all on function public.current_subscription(uuid) from anon;
revoke all on function public.can_use_feature(uuid,text) from anon;
revoke all on function public.require_feature(uuid,text) from anon;
revoke all on function public.consume_subscription_usage(uuid,text,integer) from anon;
create or replace function public.fill_subscription_client()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if new.client_id is null then
    select coalesce(
      (select cb.client_id from client_businesses cb where cb.company_id=new.company_id order by cb.is_primary desc limit 1),
      (select c.created_by from companies c where c.id=new.company_id)
    ) into new.client_id;
  end if;
  new.starts_at:=coalesce(new.starts_at,new.created_at,now());
  new.expires_at:=coalesce(new.expires_at,new.current_period_ends_at,new.trial_ends_at);
  new.grace_period_ends_at:=coalesce(
    new.grace_period_ends_at,
    new.expires_at+interval '5 days'
  );
  new.billing_cycle:=coalesce(new.billing_cycle,'monthly');
  return new;
end
$$;
drop trigger if exists fill_subscription_client on public.subscriptions;
create trigger fill_subscription_client
before insert or update of company_id,client_id,current_period_ends_at,trial_ends_at
on public.subscriptions
for each row execute function public.fill_subscription_client();
create or replace function public.assert_subscription_limit(
  p_company_id uuid,
  p_resource text
) returns void
language plpgsql stable security definer set search_path=public
as $$
declare
  v_client uuid;
  v_plan plans%rowtype;
  v_count integer;
  v_limit integer;
begin
  select coalesce(
    (select cb.client_id from client_businesses cb where cb.company_id=p_company_id order by cb.is_primary desc limit 1),
    (select c.created_by from companies c where c.id=p_company_id)
  ) into v_client;
  if v_client is null then raise exception 'Propriétaire introuvable'; end if;

  select p.* into v_plan
  from subscriptions s join plans p on p.id=s.plan_id
  where s.client_id=v_client
    and (
      s.status in ('trialing','active')
        and coalesce(s.expires_at,s.current_period_ends_at,s.trial_ends_at)>now()
      or s.status='past_due' and s.grace_period_ends_at>now()
    )
  order by s.created_at desc limit 1;
  if not found then select * into v_plan from plans where code='basic'; end if;

  if p_resource='businesses' then
    select count(*) into v_count from client_businesses where client_id=v_client;
    v_limit:=v_plan.max_businesses;
  elsif p_resource='stores' then
    select count(*) into v_count from stores where company_id=p_company_id and is_active;
    v_limit:=v_plan.max_stores;
  elsif p_resource='employees' then
    select count(*) into v_count
    from memberships m join roles r on r.id=m.role_id
    where m.company_id=p_company_id and m.is_active and r.code='employee';
    v_limit:=v_plan.max_employees;
  else
    raise exception 'Ressource de forfait inconnue: %',p_resource;
  end if;

  if v_count>=v_limit then
    raise exception 'Limite du forfait atteinte pour % (%/%). Passez à un forfait supérieur.',
      p_resource,v_count,v_limit using errcode='P0001';
  end if;
end
$$;
grant execute on function public.assert_subscription_limit(uuid,text) to authenticated;
revoke all on function public.assert_subscription_limit(uuid,text) from anon;
create or replace function public.enforce_store_subscription_limit()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if new.is_active and (tg_op='INSERT' or not old.is_active) then
    perform public.assert_subscription_limit(new.company_id,'stores');
  end if;
  return new;
end
$$;
drop trigger if exists enforce_store_subscription_limit on public.stores;
create trigger enforce_store_subscription_limit
before insert or update of is_active on public.stores
for each row execute function public.enforce_store_subscription_limit();
create or replace function public.enforce_employee_subscription_limit()
returns trigger language plpgsql security definer set search_path=public
as $$
declare v_code app_role;
begin
  select code into v_code from roles where id=new.role_id and company_id=new.company_id;
  if v_code='employee' and new.is_active and (tg_op='INSERT' or not old.is_active) then
    perform public.assert_subscription_limit(new.company_id,'employees');
  end if;
  return new;
end
$$;
drop trigger if exists enforce_employee_subscription_limit on public.memberships;
create trigger enforce_employee_subscription_limit
before insert or update of is_active,role_id on public.memberships
for each row execute function public.enforce_employee_subscription_limit();
create or replace function public.enforce_business_subscription_limit()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if not exists (
    select 1 from client_businesses
    where client_id=new.client_id and company_id=new.company_id
  ) then
    perform public.assert_subscription_limit(new.company_id,'businesses');
  end if;
  return new;
end
$$;
drop trigger if exists enforce_business_subscription_limit on public.client_businesses;
create trigger enforce_business_subscription_limit
before insert on public.client_businesses
for each row execute function public.enforce_business_subscription_limit();
create or replace function public.enforce_expense_feature()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  perform public.require_feature(new.company_id,'expenses');
  return new;
end
$$;
drop trigger if exists enforce_expense_feature on public.expenses;
create trigger enforce_expense_feature
before insert or update on public.expenses
for each row execute function public.enforce_expense_feature();
create or replace function public.process_payment_webhook(
  p_provider text,
  p_provider_reference text,
  p_provider_event_id text,
  p_status text,
  p_amount numeric,
  p_currency text,
  p_payload jsonb default '{}'::jsonb
) returns table(transaction_id uuid,subscription_id uuid,result_status text)
language plpgsql security definer set search_path=public
as $$
declare
  v_payment payment_transactions%rowtype;
  v_subscription uuid;
  v_starts timestamptz:=now();
  v_expires timestamptz;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required'; end if;

  select * into v_payment from payment_transactions
  where provider=p_provider and provider_reference=p_provider_reference
  for update;
  if not found then raise exception 'Transaction de paiement inconnue'; end if;

  if p_provider_event_id is not null and exists(
    select 1 from payment_status_log where provider_event_id=p_provider_event_id
  ) then
    return query select v_payment.id,v_payment.subscription_id,v_payment.status;
    return;
  end if;

  if p_status='succeeded' then
    if p_amount<>v_payment.amount then raise exception 'Montant de paiement incorrect'; end if;
    if upper(p_currency)<>v_payment.currency then raise exception 'Devise de paiement incorrecte'; end if;

    v_expires:=case when v_payment.billing_cycle='annual'
      then v_starts+interval '1 year' else v_starts+interval '1 month' end;

    update subscriptions set status='expired'
    where client_id=v_payment.client_id
      and company_id=v_payment.company_id
      and status in ('trialing','active','past_due');

    insert into subscriptions(
      company_id,client_id,plan_id,status,payment_provider,payment_reference,
      billing_cycle,starts_at,expires_at,grace_period_ends_at,
      current_period_ends_at,auto_renew,created_by
    ) values(
      v_payment.company_id,v_payment.client_id,v_payment.plan_id,'active',
      v_payment.provider,v_payment.provider_reference,v_payment.billing_cycle,
      v_starts,v_expires,v_expires+interval '5 days',v_expires,false,v_payment.client_id
    ) returning id into v_subscription;

    update payment_transactions set
      status='succeeded',subscription_id=v_subscription,confirmed_at=now(),
      provider_payload=coalesce(p_payload,'{}'::jsonb)
    where id=v_payment.id;
  else
    update payment_transactions set
      status=case when p_status in ('failed','cancelled','expired') then p_status else 'processing' end,
      provider_payload=coalesce(p_payload,'{}'::jsonb),
      failure_reason=case when p_status='succeeded' then null else p_payload->>'message' end
    where id=v_payment.id;
  end if;

  insert into payment_status_log(
    payment_transaction_id,old_status,new_status,source,provider_event_id,payload
  ) values(
    v_payment.id,v_payment.status,
    case when p_status in ('succeeded','failed','cancelled','expired') then p_status else 'processing' end,
    'webhook',p_provider_event_id,coalesce(p_payload,'{}'::jsonb)
  ) on conflict(provider_event_id) do nothing;

  return query select v_payment.id,v_subscription,
    case when p_status in ('succeeded','failed','cancelled','expired') then p_status else 'processing' end;
end
$$;
revoke all on function public.process_payment_webhook(text,text,text,text,numeric,text,jsonb)
from public,anon,authenticated;
grant execute on function public.process_payment_webhook(text,text,text,text,numeric,text,jsonb)
to service_role;
