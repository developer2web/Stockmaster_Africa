-- Localized subscription prices. The company's primary currency is authoritative
-- for quotes and payments; historical payment rows keep their original currency.

create table if not exists public.plan_currency_prices (
  plan_id uuid not null references public.plans(id) on delete cascade,
  currency char(3) not null check (currency = upper(currency)),
  monthly_price numeric(14,2) not null check (monthly_price >= 0),
  annual_price numeric(14,2) not null check (annual_price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan_id, currency)
);

alter table public.plan_currency_prices enable row level security;

create policy plan_currency_prices_authenticated_read
on public.plan_currency_prices for select to authenticated using (true);

create policy plan_currency_prices_super_admin_manage
on public.plan_currency_prices for all to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

grant select on public.plan_currency_prices to authenticated;
grant insert, update, delete on public.plan_currency_prices to authenticated;
revoke all on public.plan_currency_prices from anon;

-- CAD remains the catalog reference. Other values are localized commercial
-- prices and can be adjusted independently by the Super Admin without changing
-- the prices already recorded on payment transactions.
insert into public.plan_currency_prices(plan_id,currency,monthly_price,annual_price)
select p.id, localized.currency, localized.monthly_price, localized.annual_price
from public.plans p
cross join lateral (
  values
    ('CAD'::char(3), p.monthly_price, p.annual_price),
    ('USD'::char(3), case p.code when 'basic' then 14 when 'pro' then 36 else 72 end::numeric,
                    case p.code when 'basic' then 140 when 'pro' then 360 else 720 end::numeric),
    ('EUR'::char(3), case p.code when 'basic' then 13 when 'pro' then 34 else 68 end::numeric,
                    case p.code when 'basic' then 130 when 'pro' then 340 else 680 end::numeric),
    ('GBP'::char(3), case p.code when 'basic' then 11 when 'pro' then 29 else 58 end::numeric,
                    case p.code when 'basic' then 110 when 'pro' then 290 else 580 end::numeric),
    ('GNF'::char(3), case p.code when 'basic' then 120000 when 'pro' then 300000 else 600000 end::numeric,
                    case p.code when 'basic' then 1200000 when 'pro' then 3000000 else 6000000 end::numeric),
    ('XOF'::char(3), case p.code when 'basic' then 8500 when 'pro' then 22000 else 44000 end::numeric,
                    case p.code when 'basic' then 85000 when 'pro' then 220000 else 440000 end::numeric),
    ('XAF'::char(3), case p.code when 'basic' then 8500 when 'pro' then 22000 else 44000 end::numeric,
                    case p.code when 'basic' then 85000 when 'pro' then 220000 else 440000 end::numeric)
) as localized(currency,monthly_price,annual_price)
where p.is_active
on conflict(plan_id,currency) do nothing;

create or replace function public.company_subscription_plans(p_company_id uuid)
returns table(
  id uuid,
  code text,
  name text,
  description text,
  monthly_price numeric,
  annual_price numeric,
  currency text,
  max_businesses integer,
  max_stores integer,
  max_employees integer,
  plan_features jsonb
)
language plpgsql stable security definer set search_path=public as $$
declare v_currency char(3);
begin
  if not public.belongs_to_company(p_company_id) and not public.is_super_admin() then
    raise exception 'Acces refuse';
  end if;

  select c.default_currency_code into v_currency
  from public.companies c where c.id=p_company_id and c.is_active;
  if v_currency is null then raise exception 'Devise de l''entreprise introuvable'; end if;

  return query
  select p.id,p.code,p.name,p.description,pp.monthly_price,pp.annual_price,
    pp.currency::text,p.max_businesses,p.max_stores,p.max_employees,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'feature_key',pf.feature_key,
        'is_enabled',pf.is_enabled,
        'usage_limit',pf.usage_limit
      ) order by pf.feature_key)
      from public.plan_features pf where pf.plan_id=p.id
    ),'[]'::jsonb)
  from public.plans p
  join public.plan_currency_prices pp on pp.plan_id=p.id and pp.currency=v_currency
  where p.is_active
  order by pp.monthly_price,p.name;

  if not found then
    raise exception 'Tarifs d''abonnement non configures pour la devise %',v_currency;
  end if;
end $$;

grant execute on function public.company_subscription_plans(uuid) to authenticated;
revoke all on function public.company_subscription_plans(uuid) from anon;

create or replace function public.subscription_quote(
  p_company_id uuid,p_plan_id uuid,p_billing_cycle text,p_promo_code text default null
) returns table(base_amount numeric,discount_amount numeric,final_amount numeric,promotion_id uuid,bonus_days integer,currency text,promotion_name text)
language plpgsql stable security definer set search_path=public as $$
declare
  v_client uuid;
  v_plan plans%rowtype;
  v_price plan_currency_prices%rowtype;
  v_promo promotions%rowtype;
  v_company_currency char(3);
  v_has_payment boolean;
  v_used integer;
  v_catalog_amount numeric;
begin
  select cb.client_id into v_client from client_businesses cb
  where cb.company_id=p_company_id and cb.client_id=auth.uid() limit 1;
  if v_client is null and not public.is_super_admin() then raise exception 'Seul le proprietaire peut consulter ce tarif';end if;

  select * into v_plan from plans where id=p_plan_id and is_active;
  if not found or p_billing_cycle not in ('monthly','annual') then raise exception 'Forfait ou cycle invalide';end if;

  select c.default_currency_code into v_company_currency from companies c where c.id=p_company_id and c.is_active;
  if v_company_currency is null then raise exception 'Devise de l''entreprise introuvable';end if;
  select * into v_price from plan_currency_prices pp where pp.plan_id=p_plan_id and pp.currency=v_company_currency;
  if not found then raise exception 'Tarif non configure pour la devise %',v_company_currency;end if;

  base_amount:=case when p_billing_cycle='annual' then v_price.annual_price else v_price.monthly_price end;
  v_catalog_amount:=case when p_billing_cycle='annual' then v_plan.annual_price else v_plan.monthly_price end;
  discount_amount:=0;bonus_days:=0;promotion_id:=null;promotion_name:=null;currency:=v_company_currency::text;
  if nullif(upper(trim(p_promo_code)),'') is not null then
    select * into v_promo from promotions where code=upper(trim(p_promo_code)) and is_active and starts_at<=now() and expires_at>=now();
    if not found then raise exception 'Code promotionnel invalide ou expire';end if;
    if exists(select 1 from promotion_plans pp where pp.promotion_id=v_promo.id)
      and not exists(select 1 from promotion_plans pp where pp.promotion_id=v_promo.id and pp.plan_id=p_plan_id) then raise exception 'Cette promotion ne concerne pas ce forfait';end if;
    select exists(select 1 from payment_transactions pt where pt.client_id=coalesce(v_client,auth.uid()) and pt.status='succeeded') into v_has_payment;
    if v_promo.audience='new_clients' and v_has_payment then raise exception 'Cette promotion est reservee aux nouveaux clients';end if;
    if v_promo.audience='existing_clients' and not v_has_payment then raise exception 'Cette promotion est reservee aux clients existants';end if;
    select count(*) into v_used from promotion_redemptions pr where pr.promotion_id=v_promo.id;
    if v_promo.usage_limit is not null and v_used>=v_promo.usage_limit then raise exception 'La limite d''utilisation de cette promotion est atteinte';end if;
    if exists(select 1 from promotion_redemptions pr where pr.promotion_id=v_promo.id and pr.company_id=p_company_id) then raise exception 'Cette promotion a deja ete utilisee par cette entreprise';end if;
    promotion_id:=v_promo.id;promotion_name:=v_promo.name;
    if v_promo.promotion_type='percentage' then discount_amount:=round(base_amount*v_promo.value/100,2);
    elsif v_promo.promotion_type='fixed_amount' then
      -- Existing fixed promotions are catalog-CAD amounts. Scale them with the
      -- localized plan price so their commercial value remains consistent.
      discount_amount:=least(base_amount,round(v_promo.value*base_amount/nullif(v_catalog_amount,0),2));
    else bonus_days:=v_promo.value::integer;end if;
  end if;
  final_amount:=greatest(0,base_amount-discount_amount);
  return next;
end $$;

grant execute on function public.subscription_quote(uuid,uuid,text,text) to authenticated;
revoke all on function public.subscription_quote(uuid,uuid,text,text) from anon;
