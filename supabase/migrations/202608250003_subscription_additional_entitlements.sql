-- Complete the advertised Basic / Pro / Business matrix and enforce the
-- operational boundaries that must not depend on the client UI.

update public.billing_settings
set trial_days=14,trial_enabled=true,updated_at=now()
where id;

insert into public.plan_features(plan_id,feature_key,is_enabled,usage_limit)
select p.id,f.feature_key,
  case
    when f.tier='all' then true
    when f.tier='pro' then p.code in ('pro','premium')
    when f.tier='business' then p.code='premium'
    else false
  end,
  null
from public.plans p
cross join (values
  ('trial_14_days','all'),
  ('orange_money_payments','all'),
  ('stripe_payments','all'),
  ('offline_mode','all'),
  ('desktop_web','all'),
  ('low_stock_alerts','all'),
  ('customer_debt','all'),
  ('supplier_debt','pro'),
  ('advanced_cash_closure','pro'),
  ('transfers','pro'),
  ('multi_business','business')
) as f(feature_key,tier)
where p.code in ('basic','pro','premium')
on conflict(plan_id,feature_key) do update set
  is_enabled=excluded.is_enabled,
  usage_limit=excluded.usage_limit,
  updated_at=now();

-- Basic keeps simple cash closing, but cannot retain the advanced opening and
-- variance controls after a downgrade.
update public.companies c
set cash_opening_required=false,cash_variance_reason_threshold=0,updated_at=now()
where (cash_opening_required or cash_variance_reason_threshold>0)
and not exists (
  select 1
  from public.subscriptions s
  join public.plans p on p.id=s.plan_id and p.is_active
  join public.plan_features pf on pf.plan_id=p.id
    and pf.feature_key='advanced_cash_closure' and pf.is_enabled
  where s.company_id=c.id and (
    s.status in ('trialing','active')
      and coalesce(s.expires_at,s.current_period_ends_at,s.trial_ends_at)>now()
    or s.status='past_due' and s.grace_period_ends_at>now()
  )
);

create or replace function public.enforce_advanced_cash_closure_feature()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if (new.cash_opening_required or new.cash_variance_reason_threshold>0)
    and (
      new.cash_opening_required is distinct from old.cash_opening_required
      or new.cash_variance_reason_threshold is distinct from old.cash_variance_reason_threshold
    ) then
    perform public.require_feature(new.id,'advanced_cash_closure');
  end if;
  return new;
end $$;

drop trigger if exists enforce_advanced_cash_closure_feature on public.companies;
create trigger enforce_advanced_cash_closure_feature
before update of cash_opening_required,cash_variance_reason_threshold on public.companies
for each row execute function public.enforce_advanced_cash_closure_feature();

-- Paying an old supplier balance remains possible after a downgrade. Only a
-- new or increased supplier debt requires Pro or Business.
create or replace function public.enforce_supplier_debt_feature()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_previous_due numeric:=0;
begin
  if tg_op='UPDATE' then v_previous_due:=coalesce(old.amount_due,0);end if;
  if coalesce(new.amount_due,0)>v_previous_due then
    perform public.require_feature(new.company_id,'supplier_debt');
  end if;
  return new;
end $$;

drop trigger if exists enforce_supplier_debt_feature on public.purchases;
create trigger enforce_supplier_debt_feature
before insert or update of amount_due on public.purchases
for each row execute function public.enforce_supplier_debt_feature();

-- A normal registration stores selected_plan in auth metadata. Apply it to the
-- trial instead of silently forcing every new customer onto Basic.
create or replace function public.fill_subscription_client()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_trial integer;v_grace integer;v_trial_enabled boolean;v_requested_plan uuid;
begin
  if new.client_id is null then
    select coalesce(
      (select cb.client_id from client_businesses cb where cb.company_id=new.company_id order by cb.is_primary desc limit 1),
      (select c.created_by from companies c where c.id=new.company_id)
    ) into new.client_id;
  end if;
  new.starts_at:=coalesce(new.starts_at,new.created_at,now());
  select trial_days,grace_period_days,trial_enabled into v_trial,v_grace,v_trial_enabled
  from billing_settings where id;
  if tg_op='INSERT' and new.status='trialing' and coalesce(new.payment_provider,'')='' then
    select p.id into v_requested_plan
    from auth.users u
    join plans p on p.code=case
      when u.raw_user_meta_data->>'selected_plan' in ('basic','pro','premium')
        then u.raw_user_meta_data->>'selected_plan'
      when u.raw_user_meta_data->>'selected_plan'='business' then 'premium'
      else 'basic'
    end and p.is_active
    where u.id=coalesce(new.client_id,new.created_by,auth.uid());
    new.plan_id:=coalesce(v_requested_plan,new.plan_id);
    new.trial_ends_at:=new.starts_at+make_interval(days=>v_trial);
    new.current_period_ends_at:=new.trial_ends_at;
    new.expires_at:=new.trial_ends_at;
    if not v_trial_enabled then new.status:='expired';end if;
  else
    new.expires_at:=coalesce(new.expires_at,new.current_period_ends_at,new.trial_ends_at);
  end if;
  new.grace_period_ends_at:=coalesce(new.grace_period_ends_at,new.expires_at+make_interval(days=>v_grace));
  new.billing_cycle:=coalesce(new.billing_cycle,'monthly');
  return new;
end $$;

drop function if exists public.super_admin_grant_trial(uuid,integer);
create function public.super_admin_grant_trial(
  p_company_id uuid,p_days integer default null,p_plan_code text default 'basic'
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_client uuid;v_plan uuid;v_subscription uuid;v_days integer;v_expires timestamptz;
begin
  if not public.is_super_admin() then raise exception 'Accès Super Admin requis';end if;
  select coalesce(p_days,trial_days) into v_days from billing_settings where id;
  if v_days<1 or v_days>90 then raise exception 'Durée d''essai invalide';end if;
  if p_plan_code='business' then p_plan_code:='premium';end if;
  if p_plan_code not in ('basic','pro','premium') then raise exception 'Forfait d''essai invalide';end if;
  if exists(
    select 1 from subscriptions where company_id=p_company_id and status='active'
    and coalesce(expires_at,current_period_ends_at)>now()
  ) then raise exception 'Cette entreprise possède déjà un abonnement actif';end if;
  select cb.client_id into v_client from client_businesses cb
  where cb.company_id=p_company_id order by cb.is_primary desc,cb.created_at limit 1;
  if v_client is null then raise exception 'Propriétaire de l''entreprise introuvable';end if;
  select id into v_plan from plans where code=p_plan_code and is_active;
  if v_plan is null then raise exception 'Forfait d''essai indisponible';end if;
  v_expires:=now()+make_interval(days=>v_days);
  update subscriptions set status='expired'
  where company_id=p_company_id and status in ('pending','trialing','past_due');
  insert into subscriptions(
    company_id,client_id,plan_id,status,payment_provider,payment_reference,billing_cycle,
    starts_at,trial_ends_at,expires_at,current_period_ends_at,grace_period_ends_at,auto_renew,created_by
  )
  select p_company_id,v_client,v_plan,'trialing','free_trial','trial-'||gen_random_uuid()::text,'monthly',
    now(),v_expires,v_expires,v_expires,v_expires+make_interval(days=>grace_period_days),false,auth.uid()
  from billing_settings where id
  returning id into v_subscription;
  insert into audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by)
  values(p_company_id,auth.uid(),'grant_free_trial','subscriptions',v_subscription,
    jsonb_build_object('days',v_days,'plan_code',p_plan_code),auth.uid());
  return v_subscription;
end $$;

grant execute on function public.super_admin_grant_trial(uuid,integer,text) to authenticated;
revoke all on function public.super_admin_grant_trial(uuid,integer,text) from anon;
