-- Enforce multi-business subscription limits without deleting tenant data.
-- Excess companies are archived only after a payment is confirmed and are
-- restored automatically when a later plan has enough capacity.

alter table public.companies
  add column if not exists plan_archived_at timestamptz,
  add column if not exists plan_archived_by uuid references public.profiles(id) on delete set null,
  add column if not exists plan_archive_reason text;

alter table public.payment_transactions
  add column if not exists retained_company_id uuid references public.companies(id) on delete restrict;

create index if not exists companies_plan_archived_idx
  on public.companies(plan_archived_at, created_at);

create or replace function public.apply_subscription_business_limit(
  p_client_id uuid,
  p_plan_id uuid,
  p_retained_company_id uuid default null,
  p_actor_id uuid default null
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_limit integer;
  v_active_count integer;
  v_actor uuid:=coalesce(p_actor_id,p_client_id);
  v_row record;
  v_should_archive boolean;
begin
  select greatest(1,max_businesses) into v_limit
  from public.plans where id=p_plan_id and is_active;
  if v_limit is null then raise exception 'Forfait indisponible'; end if;

  if p_retained_company_id is not null and not exists(
    select 1 from public.client_businesses
    where client_id=p_client_id and company_id=p_retained_company_id
  ) then
    raise exception 'Entreprise à conserver invalide';
  end if;

  select count(*) into v_active_count
  from public.client_businesses cb
  join public.companies c on c.id=cb.company_id
  where cb.client_id=p_client_id and c.plan_archived_at is null;

  if v_active_count>v_limit and p_retained_company_id is null then
    raise exception 'Choisissez l’entreprise à conserver avant de confirmer ce downgrade';
  end if;

  for v_row in
    select ranked.company_id,ranked.position,c.plan_archived_at
    from (
      select cb.company_id,
        row_number() over(order by
          case when cb.company_id=p_retained_company_id then 0 else 1 end,
          case when c.plan_archived_at is null then 0 else 1 end,
          case when cb.is_primary then 0 else 1 end,
          cb.created_at,cb.company_id
        ) as position
      from public.client_businesses cb
      join public.companies c on c.id=cb.company_id
      where cb.client_id=p_client_id
    ) ranked
    join public.companies c on c.id=ranked.company_id
  loop
    v_should_archive:=v_row.position>v_limit;
    if v_should_archive and v_row.plan_archived_at is null then
      update public.companies set
        plan_archived_at=now(),plan_archived_by=v_actor,
        plan_archive_reason='Limite du forfait après downgrade'
      where id=v_row.company_id;
      insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by)
      values(v_row.company_id,v_actor,'archive_company_for_plan_limit','companies',v_row.company_id,
        jsonb_build_object('plan_id',p_plan_id,'retained_company_id',p_retained_company_id,'max_businesses',v_limit),v_actor);
    elsif not v_should_archive and v_row.plan_archived_at is not null then
      update public.companies set
        plan_archived_at=null,plan_archived_by=null,plan_archive_reason=null
      where id=v_row.company_id;
      insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by)
      values(v_row.company_id,v_actor,'restore_company_after_upgrade','companies',v_row.company_id,
        jsonb_build_object('plan_id',p_plan_id,'max_businesses',v_limit),v_actor);
    end if;
  end loop;
end
$$;

revoke all on function public.apply_subscription_business_limit(uuid,uuid,uuid,uuid)
from public,anon,authenticated;
grant execute on function public.apply_subscription_business_limit(uuid,uuid,uuid,uuid)
to service_role;

create or replace function public.enforce_business_limit_on_confirmed_payment()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.status='succeeded' and (tg_op='INSERT' or old.status is distinct from 'succeeded') then
    perform public.apply_subscription_business_limit(
      new.client_id,new.plan_id,new.retained_company_id,coalesce(new.reviewed_by,new.client_id)
    );
  end if;
  return new;
end
$$;

drop trigger if exists enforce_business_limit_after_payment on public.payment_transactions;
create trigger enforce_business_limit_after_payment
after insert or update of status on public.payment_transactions
for each row execute function public.enforce_business_limit_on_confirmed_payment();

drop function if exists public.submit_manual_subscription_payment(uuid,uuid,text,text,text,text,uuid);
create function public.submit_manual_subscription_payment(
  p_company_id uuid,p_plan_id uuid,p_billing_cycle text,p_reference text,
  p_proof_path text default null,p_promo_code text default null,
  p_operation_id uuid default gen_random_uuid(),p_retained_company_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_quote record;
  v_id uuid;
  v_limit integer;
  v_active_count integer;
begin
  if length(trim(p_reference))<4 then raise exception 'Référence Orange Money requise'; end if;
  if p_proof_path is not null and split_part(p_proof_path,'/',1)<>auth.uid()::text then
    raise exception 'Preuve de paiement invalide';
  end if;
  if not exists(select 1 from public.client_businesses where client_id=auth.uid() and company_id=p_company_id) then
    raise exception 'Seul le propriétaire peut payer un forfait';
  end if;
  if p_retained_company_id is not null and not exists(
    select 1 from public.client_businesses where client_id=auth.uid() and company_id=p_retained_company_id
  ) then raise exception 'Entreprise à conserver invalide'; end if;

  select greatest(1,max_businesses) into v_limit from public.plans where id=p_plan_id and is_active;
  select count(*) into v_active_count
  from public.client_businesses cb join public.companies c on c.id=cb.company_id
  where cb.client_id=auth.uid() and c.plan_archived_at is null;
  if v_active_count>coalesce(v_limit,0) and p_retained_company_id is null then
    raise exception 'Choisissez l’entreprise à conserver avant de continuer';
  end if;

  perform public.lock_operation(p_operation_id);
  select id into v_id from public.payment_transactions
  where client_id=auth.uid() and operation_id=p_operation_id;
  if v_id is not null then return v_id; end if;

  select * into v_quote from public.subscription_quote(p_company_id,p_plan_id,p_billing_cycle,p_promo_code);
  insert into public.payment_transactions(
    client_id,company_id,plan_id,provider,provider_reference,operation_id,billing_cycle,
    base_amount,discount_amount,amount,currency,status,proof_path,submitted_at,
    promotion_id,bonus_days,retained_company_id
  ) values(
    auth.uid(),p_company_id,p_plan_id,'orange_money_manual',trim(p_reference),p_operation_id,
    p_billing_cycle,v_quote.base_amount,v_quote.discount_amount,v_quote.final_amount,
    v_quote.currency,'processing',p_proof_path,now(),v_quote.promotion_id,v_quote.bonus_days,
    p_retained_company_id
  ) returning id into v_id;
  insert into public.payment_status_log(payment_transaction_id,old_status,new_status,source,payload)
  values(v_id,null,'processing','manual-submission',
    jsonb_build_object('proof',p_proof_path is not null,'retained_company_id',p_retained_company_id));
  return v_id;
end
$$;

grant execute on function public.submit_manual_subscription_payment(uuid,uuid,text,text,text,text,uuid,uuid)
to authenticated;
revoke all on function public.submit_manual_subscription_payment(uuid,uuid,text,text,text,text,uuid,uuid)
from anon;

-- Archived companies are inaccessible to the client app while remaining visible
-- to the dedicated Super Admin through its own platform RPCs.
create or replace function public.is_business_owner(p_company uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.client_businesses cb
    join public.companies c on c.id=cb.company_id and c.is_active and c.plan_archived_at is null
    where cb.client_id=auth.uid() and cb.company_id=p_company
  )
$$;

create or replace function public.belongs_to_company(p_company uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_business_owner(p_company) or exists(
    select 1 from public.memberships m
    join public.companies c on c.id=m.company_id and c.is_active and c.plan_archived_at is null
    where m.user_id=auth.uid() and m.company_id=p_company and m.is_active
  )
$$;

create or replace function public.is_company_admin(p_company_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.memberships m join public.roles r on r.id=m.role_id
    join public.companies c on c.id=m.company_id and c.is_active and c.plan_archived_at is null
    where m.user_id=auth.uid() and m.company_id=p_company_id and m.is_active and r.code='company_admin'
  )
$$;

create or replace function public.can_access_store(p_company uuid,p_store uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_business_owner(p_company) or exists(
    select 1 from public.memberships m
    join public.companies c on c.id=m.company_id and c.is_active and c.plan_archived_at is null
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
    join public.companies c on c.id=m.company_id and c.is_active and c.plan_archived_at is null
    join public.roles r on r.id=m.role_id
    left join public.role_permissions rp on rp.role_id=r.id
    left join public.permissions p on p.id=rp.permission_id
    where m.user_id=auth.uid() and m.company_id=p_company and m.is_active
      and (r.code='company_admin' or p.code=p_code
        or (p_code like '%.read' and p.code=regexp_replace(p_code,'\.read$','.write')))
  )
$$;

create or replace function public.has_active_subscription(p_company uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.subscriptions s
    join public.companies c on c.id=s.company_id and c.is_active and c.plan_archived_at is null
    where s.company_id=p_company and (
      (s.status in ('trialing','active') and coalesce(s.expires_at,s.current_period_ends_at,s.trial_ends_at)>now())
      or (s.status='past_due' and s.grace_period_ends_at>now())
    )
  )
$$;

drop function public.get_accessible_businesses();
create function public.get_accessible_businesses()
returns table(
  company_id uuid,company_name text,membership_id uuid,role app_role,role_name text,
  subscription_status subscription_status,country_code text,country_name text,
  default_currency_code text,secondary_currency_code text,currency_locked_at timestamptz
) language sql stable security definer set search_path=public as $$
  select m.company_id,c.name,m.id,r.code,r.name,s.status,c.country_code::text,
    c.country_name,c.default_currency_code::text,c.secondary_currency_code::text,c.currency_locked_at
  from public.memberships m
  join public.companies c on c.id=m.company_id and c.is_active and c.plan_archived_at is null
  join public.roles r on r.id=m.role_id
  left join lateral(
    select status from public.subscriptions where company_id=m.company_id order by created_at desc limit 1
  ) s on true
  where m.user_id=auth.uid() and m.is_active order by c.created_at
$$;

create or replace function public.get_accessible_stores(p_company_id uuid)
returns table(store_id uuid,store_name text,address text)
language sql stable security definer set search_path=public as $$
  select s.id,s.name,s.address from public.stores s
  join public.companies c on c.id=s.company_id and c.is_active and c.plan_archived_at is null
  where s.company_id=p_company_id and s.is_active and public.can_access_store(p_company_id,s.id)
  order by s.created_at
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
  from public.memberships m
  join public.companies c on c.id=m.company_id and c.is_active and c.plan_archived_at is null
  join public.roles r on r.id=m.role_id
  join public.stores s on s.id=p_store_id and s.company_id=m.company_id and s.is_active
  left join public.role_permissions rp on rp.role_id=r.id
  left join public.permissions p on p.id=rp.permission_id
  left join lateral(
    select status from public.subscriptions where company_id=m.company_id order by created_at desc limit 1
  ) sub on true
  where m.user_id=auth.uid() and m.is_active and m.company_id=p_company_id
    and public.can_access_store(m.company_id,s.id)
  group by m.id,c.name,s.id,s.name,r.code,r.name,sub.status,c.country_code,
    c.country_name,c.default_currency_code,c.secondary_currency_code,c.currency_locked_at
$$;

grant execute on function public.get_accessible_businesses() to authenticated;
grant execute on function public.get_accessible_stores(uuid) to authenticated;
grant execute on function public.get_workspace_context(uuid,uuid) to authenticated;
revoke all on function public.get_accessible_businesses() from anon;
revoke all on function public.get_accessible_stores(uuid) from anon;
revoke all on function public.get_workspace_context(uuid,uuid) from anon;
