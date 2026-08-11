-- Manual Orange Money review, configurable promotions and billing lifecycle.

create table public.billing_settings (
  id boolean primary key default true check (id),
  orange_money_number text not null default '',
  orange_money_account_name text not null default '',
  trial_days integer not null default 14 check (trial_days between 0 and 90),
  grace_period_days integer not null default 5 check (grace_period_days between 0 and 30),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
insert into public.billing_settings(id) values(true) on conflict(id) do nothing;

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null check(length(trim(name)) between 2 and 100),
  code text unique,
  promotion_type text not null check(promotion_type in ('free_days','percentage','fixed_amount')),
  value numeric(14,2) not null check(value > 0),
  starts_at timestamptz not null,
  expires_at timestamptz not null check(expires_at > starts_at),
  usage_limit integer check(usage_limit is null or usage_limit > 0),
  audience text not null default 'all' check(audience in ('new_clients','existing_clients','all')),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(promotion_type <> 'percentage' or value <= 95),
  check(code is null or code=upper(trim(code)))
);
create table public.promotion_plans (
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete cascade,
  primary key(promotion_id,plan_id)
);
create table public.promotion_redemptions (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete restrict,
  client_id uuid not null references public.profiles(id),
  company_id uuid not null references public.companies(id) on delete cascade,
  payment_transaction_id uuid unique references public.payment_transactions(id) on delete restrict,
  discount_amount numeric(14,2) not null default 0,
  bonus_days integer not null default 0,
  created_at timestamptz not null default now(),
  unique(promotion_id,company_id)
);

alter table public.payment_transactions drop constraint if exists payment_transactions_status_check;
alter table public.payment_transactions
  add constraint payment_transactions_status_check
  check(status in ('pending','processing','succeeded','failed','cancelled','expired'));
alter table public.payment_transactions drop constraint if exists payment_transactions_amount_check;
alter table public.payment_transactions add constraint payment_transactions_amount_check check(amount >= 0);
alter table public.payment_transactions
  add column if not exists base_amount numeric(14,2),
  add column if not exists discount_amount numeric(14,2) not null default 0 check(discount_amount >= 0),
  add column if not exists promotion_id uuid references public.promotions(id) on delete set null,
  add column if not exists bonus_days integer not null default 0 check(bonus_days >= 0),
  add column if not exists proof_path text,
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id),
  add column if not exists rejection_reason text;
update public.payment_transactions set base_amount=amount where base_amount is null;
alter table public.payment_transactions alter column base_amount set not null;

create or replace function public.fill_payment_base_amount() returns trigger language plpgsql set search_path=public as $$
begin new.base_amount:=coalesce(new.base_amount,new.amount);return new;end $$;
create trigger fill_payment_base_amount before insert on public.payment_transactions
for each row execute function public.fill_payment_base_amount();

create index payment_transactions_review_idx on public.payment_transactions(status,provider,created_at desc);
create index promotions_active_dates_idx on public.promotions(is_active,starts_at,expires_at);

create trigger touch_updated_at before update on public.billing_settings
for each row execute function public.touch_updated_at();
create trigger touch_updated_at before update on public.promotions
for each row execute function public.touch_updated_at();
alter table public.billing_settings enable row level security;
alter table public.promotions enable row level security;
alter table public.promotion_plans enable row level security;
alter table public.promotion_redemptions enable row level security;
create policy billing_settings_authenticated_read on public.billing_settings for select to authenticated using(true);
create policy billing_settings_super_admin_write on public.billing_settings for all to authenticated
using(public.is_super_admin()) with check(public.is_super_admin());
create policy promotions_authenticated_read on public.promotions for select to authenticated
using(is_active and starts_at<=now() and expires_at>=now() or public.is_super_admin());
create policy promotions_super_admin_write on public.promotions for all to authenticated
using(public.is_super_admin()) with check(public.is_super_admin());
create policy promotion_plans_authenticated_read on public.promotion_plans for select to authenticated
using(exists(select 1 from public.promotions p where p.id=promotion_id and (p.is_active or public.is_super_admin())));
create policy promotion_plans_super_admin_write on public.promotion_plans for all to authenticated
using(public.is_super_admin()) with check(public.is_super_admin());
create policy promotion_redemptions_owner_read on public.promotion_redemptions for select to authenticated
using(client_id=auth.uid() or public.is_super_admin());
grant select on public.billing_settings,public.promotions,public.promotion_plans,public.promotion_redemptions to authenticated;
grant insert,update,delete on public.billing_settings,public.promotions,public.promotion_plans to authenticated;
revoke insert,update,delete on public.promotion_redemptions from anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('payment-proofs','payment-proofs',false,4194304,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy payment_proofs_owner_read on storage.objects for select to authenticated
using(bucket_id='payment-proofs' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_super_admin()));
create policy payment_proofs_owner_insert on storage.objects for insert to authenticated
with check(bucket_id='payment-proofs' and (storage.foldername(name))[1]=auth.uid()::text);
create policy payment_proofs_owner_delete on storage.objects for delete to authenticated
using(bucket_id='payment-proofs' and (storage.foldername(name))[1]=auth.uid()::text);

create or replace function public.subscription_quote(
  p_company_id uuid,p_plan_id uuid,p_billing_cycle text,p_promo_code text default null
) returns table(base_amount numeric,discount_amount numeric,final_amount numeric,promotion_id uuid,bonus_days integer,currency text,promotion_name text)
language plpgsql stable security definer set search_path=public as $$
declare v_client uuid;v_plan plans%rowtype;v_promo promotions%rowtype;v_has_payment boolean;v_used integer;
begin
  select cb.client_id into v_client from client_businesses cb
  where cb.company_id=p_company_id and cb.client_id=auth.uid() limit 1;
  if v_client is null and not public.is_super_admin() then raise exception 'Seul le propriétaire peut consulter ce tarif';end if;
  select * into v_plan from plans where id=p_plan_id and is_active;
  if not found or p_billing_cycle not in ('monthly','annual') then raise exception 'Forfait ou cycle invalide';end if;
  base_amount:=case when p_billing_cycle='annual' then v_plan.annual_price else v_plan.monthly_price end;
  discount_amount:=0;bonus_days:=0;promotion_id:=null;promotion_name:=null;currency:=v_plan.currency;
  if nullif(upper(trim(p_promo_code)),'') is not null then
    select * into v_promo from promotions where code=upper(trim(p_promo_code)) and is_active and starts_at<=now() and expires_at>=now();
    if not found then raise exception 'Code promotionnel invalide ou expiré';end if;
    if exists(select 1 from promotion_plans pp where pp.promotion_id=v_promo.id)
      and not exists(select 1 from promotion_plans pp where pp.promotion_id=v_promo.id and pp.plan_id=p_plan_id) then raise exception 'Cette promotion ne concerne pas ce forfait';end if;
    select exists(select 1 from payment_transactions pt where pt.client_id=coalesce(v_client,auth.uid()) and pt.status='succeeded') into v_has_payment;
    if v_promo.audience='new_clients' and v_has_payment then raise exception 'Cette promotion est réservée aux nouveaux clients';end if;
    if v_promo.audience='existing_clients' and not v_has_payment then raise exception 'Cette promotion est réservée aux clients existants';end if;
    select count(*) into v_used from promotion_redemptions pr where pr.promotion_id=v_promo.id;
    if v_promo.usage_limit is not null and v_used>=v_promo.usage_limit then raise exception 'La limite d''utilisation de cette promotion est atteinte';end if;
    if exists(select 1 from promotion_redemptions pr where pr.promotion_id=v_promo.id and pr.company_id=p_company_id) then raise exception 'Cette promotion a déjà été utilisée par cette entreprise';end if;
    promotion_id:=v_promo.id;promotion_name:=v_promo.name;
    if v_promo.promotion_type='percentage' then discount_amount:=round(base_amount*v_promo.value/100,2);
    elsif v_promo.promotion_type='fixed_amount' then discount_amount:=least(base_amount,v_promo.value);
    else bonus_days:=v_promo.value::integer;end if;
  end if;
  final_amount:=greatest(0,base_amount-discount_amount);
  return next;
end $$;

create or replace function public.submit_manual_subscription_payment(
  p_company_id uuid,p_plan_id uuid,p_billing_cycle text,p_reference text,
  p_proof_path text default null,p_promo_code text default null,p_operation_id uuid default gen_random_uuid()
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_quote record;v_id uuid;
begin
  if length(trim(p_reference))<4 then raise exception 'Référence Orange Money requise';end if;
  if p_proof_path is not null and split_part(p_proof_path,'/',1)<>auth.uid()::text then raise exception 'Preuve de paiement invalide';end if;
  perform public.lock_operation(p_operation_id);
  select id into v_id from payment_transactions where client_id=auth.uid() and operation_id=p_operation_id;
  if v_id is not null then return v_id;end if;
  select * into v_quote from public.subscription_quote(p_company_id,p_plan_id,p_billing_cycle,p_promo_code);
  insert into payment_transactions(client_id,company_id,plan_id,provider,provider_reference,operation_id,billing_cycle,base_amount,discount_amount,amount,currency,status,proof_path,submitted_at,promotion_id,bonus_days)
  values(auth.uid(),p_company_id,p_plan_id,'orange_money_manual',trim(p_reference),p_operation_id,p_billing_cycle,v_quote.base_amount,v_quote.discount_amount,v_quote.final_amount,v_quote.currency,'processing',p_proof_path,now(),v_quote.promotion_id,v_quote.bonus_days)
  returning id into v_id;
  insert into payment_status_log(payment_transaction_id,old_status,new_status,source,payload)
  values(v_id,null,'processing','manual-submission',jsonb_build_object('proof',p_proof_path is not null));
  return v_id;
end $$;

create or replace function public.super_admin_review_manual_payment(p_payment_id uuid,p_approve boolean,p_reason text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_payment payment_transactions%rowtype;v_subscription uuid;v_expires timestamptz;v_old text;
begin
  if not public.is_super_admin() then raise exception 'Accès Super Admin requis';end if;
  select * into v_payment from payment_transactions where id=p_payment_id and provider='orange_money_manual' for update;
  if not found then raise exception 'Paiement Orange Money introuvable';end if;
  if v_payment.status in ('succeeded','failed') then return coalesce(v_payment.subscription_id,v_payment.id);end if;
  v_old:=v_payment.status;
  if not p_approve then
    if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Le motif du refus est obligatoire';end if;
    update payment_transactions set status='failed',failure_reason=trim(p_reason),rejection_reason=trim(p_reason),reviewed_at=now(),reviewed_by=auth.uid() where id=p_payment_id;
    insert into payment_status_log(payment_transaction_id,old_status,new_status,source,payload) values(p_payment_id,v_old,'failed','super-admin',jsonb_build_object('reason',trim(p_reason)));
    return v_payment.id;
  end if;
  v_expires:=case when v_payment.billing_cycle='annual' then now()+interval '1 year' else now()+interval '1 month' end + make_interval(days=>v_payment.bonus_days);
  update subscriptions set status='expired' where company_id=v_payment.company_id and status in ('pending','trialing','active','past_due');
  insert into subscriptions(company_id,client_id,plan_id,status,payment_provider,payment_reference,billing_cycle,starts_at,expires_at,grace_period_ends_at,current_period_ends_at,auto_renew,created_by)
  select v_payment.company_id,v_payment.client_id,v_payment.plan_id,'active',v_payment.provider,v_payment.provider_reference,v_payment.billing_cycle,now(),v_expires,v_expires+make_interval(days=>bs.grace_period_days),v_expires,false,v_payment.client_id from billing_settings bs where bs.id
  returning id into v_subscription;
  update payment_transactions set status='succeeded',subscription_id=v_subscription,confirmed_at=now(),reviewed_at=now(),reviewed_by=auth.uid(),failure_reason=null,rejection_reason=null where id=p_payment_id;
  if v_payment.promotion_id is not null then insert into promotion_redemptions(promotion_id,client_id,company_id,payment_transaction_id,discount_amount,bonus_days) values(v_payment.promotion_id,v_payment.client_id,v_payment.company_id,p_payment_id,v_payment.discount_amount,v_payment.bonus_days);end if;
  insert into payment_status_log(payment_transaction_id,old_status,new_status,source,payload) values(p_payment_id,v_old,'succeeded','super-admin',jsonb_build_object('reviewed_by',auth.uid()));
  insert into audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by) values(v_payment.company_id,auth.uid(),'approve_manual_payment','payment_transactions',p_payment_id,jsonb_build_object('amount',v_payment.amount,'currency',v_payment.currency),auth.uid());
  return v_subscription;
end $$;

create or replace function public.refresh_subscription_lifecycle(p_company_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.belongs_to_company(p_company_id) and not public.is_super_admin() then raise exception 'Accès refusé';end if;
  update subscriptions set status=case when grace_period_ends_at>now() then 'past_due'::subscription_status else 'expired'::subscription_status end
  where company_id=p_company_id and status in ('trialing','active') and coalesce(expires_at,current_period_ends_at,trial_ends_at)<=now();
  update subscriptions set status='expired' where company_id=p_company_id and status='past_due' and grace_period_ends_at<=now();
end $$;

create or replace function public.fill_subscription_client()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_trial integer;v_grace integer;
begin
  if new.client_id is null then select coalesce((select cb.client_id from client_businesses cb where cb.company_id=new.company_id order by cb.is_primary desc limit 1),(select c.created_by from companies c where c.id=new.company_id)) into new.client_id;end if;
  new.starts_at:=coalesce(new.starts_at,new.created_at,now());
  select trial_days,grace_period_days into v_trial,v_grace from billing_settings where id;
  if tg_op='INSERT' and new.status='trialing' then
    new.trial_ends_at:=new.starts_at+make_interval(days=>v_trial);
    new.current_period_ends_at:=new.trial_ends_at;
    new.expires_at:=new.trial_ends_at;
  else new.expires_at:=coalesce(new.expires_at,new.current_period_ends_at,new.trial_ends_at);end if;
  new.grace_period_ends_at:=coalesce(new.grace_period_ends_at,new.expires_at+make_interval(days=>v_grace));
  new.billing_cycle:=coalesce(new.billing_cycle,'monthly');return new;
end $$;

create or replace function public.super_admin_billing_payments()
returns table(id uuid,company_id uuid,company_name text,client_email text,plan_name text,amount numeric,base_amount numeric,discount_amount numeric,currency text,provider text,provider_reference text,billing_cycle text,status text,proof_path text,promotion_name text,submitted_at timestamptz,reviewed_at timestamptz,reviewer_name text,failure_reason text,created_at timestamptz)
language sql stable security definer set search_path=public as $$
select pt.id,pt.company_id,c.name,au.email::text,p.name,pt.amount,pt.base_amount,pt.discount_amount,pt.currency::text,pt.provider,pt.provider_reference,pt.billing_cycle,pt.status,pt.proof_path,pm.name,pt.submitted_at,pt.reviewed_at,rv.full_name,pt.failure_reason,pt.created_at
from payment_transactions pt join companies c on c.id=pt.company_id join auth.users au on au.id=pt.client_id join plans p on p.id=pt.plan_id left join promotions pm on pm.id=pt.promotion_id left join profiles rv on rv.id=pt.reviewed_by
where public.is_super_admin() order by pt.created_at desc limit 500 $$;

create or replace function public.super_admin_save_promotion(
  p_id uuid,p_name text,p_code text,p_type text,p_value numeric,p_starts_at timestamptz,
  p_expires_at timestamptz,p_usage_limit integer,p_audience text,p_is_active boolean,p_plan_ids uuid[]
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid:=coalesce(p_id,gen_random_uuid());v_plan uuid;
begin
  if not public.is_super_admin() then raise exception 'Accès Super Admin requis';end if;
  if p_type not in ('free_days','percentage','fixed_amount') or p_value<=0 then raise exception 'Promotion invalide';end if;
  if p_type='percentage' and p_value>95 then raise exception 'La réduction maximale est de 95 %%';end if;
  if p_audience not in ('new_clients','existing_clients','all') or p_expires_at<=p_starts_at then raise exception 'Période ou audience invalide';end if;
  insert into promotions(id,name,code,promotion_type,value,starts_at,expires_at,usage_limit,audience,is_active,created_by)
  values(v_id,trim(p_name),nullif(upper(trim(p_code)),''),p_type,p_value,p_starts_at,p_expires_at,p_usage_limit,p_audience,p_is_active,auth.uid())
  on conflict(id) do update set name=excluded.name,code=excluded.code,promotion_type=excluded.promotion_type,value=excluded.value,starts_at=excluded.starts_at,expires_at=excluded.expires_at,usage_limit=excluded.usage_limit,audience=excluded.audience,is_active=excluded.is_active,updated_at=now();
  delete from promotion_plans where promotion_id=v_id;
  foreach v_plan in array coalesce(p_plan_ids,'{}'::uuid[]) loop
    if not exists(select 1 from plans where id=v_plan) then raise exception 'Forfait invalide';end if;
    insert into promotion_plans(promotion_id,plan_id) values(v_id,v_plan);
  end loop;
  return v_id;
end $$;

grant execute on function public.subscription_quote(uuid,uuid,text,text) to authenticated;
grant execute on function public.submit_manual_subscription_payment(uuid,uuid,text,text,text,text,uuid) to authenticated;
grant execute on function public.super_admin_review_manual_payment(uuid,boolean,text) to authenticated;
grant execute on function public.refresh_subscription_lifecycle(uuid) to authenticated;
grant execute on function public.super_admin_billing_payments() to authenticated;
grant execute on function public.super_admin_save_promotion(uuid,text,text,text,numeric,timestamptz,timestamptz,integer,text,boolean,uuid[]) to authenticated;
revoke all on function public.submit_manual_subscription_payment(uuid,uuid,text,text,text,text,uuid) from anon;
revoke all on function public.super_admin_review_manual_payment(uuid,boolean,text) from anon;

-- Make provider-confirmed payments use the same configurable grace period.
do $migration$
declare definition text;
begin
  definition:=pg_get_functiondef('public.process_payment_webhook(text,text,text,text,numeric,text,jsonb)'::regprocedure);
  definition:=replace(definition,'v_expires + ''5 days''::interval','(select v_expires+make_interval(days=>grace_period_days) from billing_settings where id)');
  execute definition;
end
$migration$;
