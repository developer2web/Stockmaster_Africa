-- Subscription prices are billed from one catalog currency everywhere.
-- Business transaction currencies remain independent from subscription billing.
update public.plans
set monthly_price = case code when 'basic' then 120000 when 'pro' then 300000 when 'premium' then 600000 else monthly_price end,
    annual_price = case code when 'basic' then 1200000 when 'pro' then 3000000 when 'premium' then 6000000 else annual_price end,
    currency = 'GNF'
where code in ('basic', 'pro', 'premium');

insert into public.plan_currency_prices(plan_id, currency, monthly_price, annual_price)
select p.id, 'GNF', p.monthly_price, p.annual_price
from public.plans p
where p.is_active
on conflict (plan_id, currency) do update
set monthly_price = excluded.monthly_price,
    annual_price = excluded.annual_price,
    updated_at = now();

-- Keep the account catalog identical for every company, regardless of its
-- operational currency used for sales, stock and receipts.
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
begin
  if not public.belongs_to_company(p_company_id) and not public.is_super_admin() then
    raise exception 'Acces refuse';
  end if;

  return query
  select p.id,p.code,p.name,p.description,
    pp.monthly_price,pp.annual_price,pp.currency::text,
    p.max_businesses,p.max_stores,p.max_employees,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'feature_key',pf.feature_key,
        'is_enabled',pf.is_enabled,
        'usage_limit',pf.usage_limit
      ) order by pf.feature_key)
      from public.plan_features pf where pf.plan_id=p.id
    ),'[]'::jsonb)
  from public.plans p
  join public.plan_currency_prices pp on pp.plan_id=p.id and pp.currency='GNF'
  where p.is_active
  order by pp.monthly_price,p.name;
end; $$;

grant execute on function public.company_subscription_plans(uuid) to authenticated;
revoke all on function public.company_subscription_plans(uuid) from anon;

-- Quotes and payment rows for subscriptions use the same GNF catalog.
create or replace function public.subscription_quote(
  p_company_id uuid,p_plan_id uuid,p_billing_cycle text,p_promo_code text default null
) returns table(base_amount numeric,discount_amount numeric,final_amount numeric,promotion_id uuid,bonus_days integer,currency text,promotion_name text)
language plpgsql stable security definer set search_path=public as $$
declare
  v_client uuid;
  v_plan plans%rowtype;
  v_price plan_currency_prices%rowtype;
  v_promo promotions%rowtype;
  v_has_payment boolean;
  v_used integer;
  v_catalog_amount numeric;
begin
  select cb.client_id into v_client from client_businesses cb
  where cb.company_id=p_company_id and cb.client_id=auth.uid() limit 1;
  if v_client is null and not public.is_super_admin() then raise exception 'Seul le proprietaire peut consulter ce tarif';end if;

  select * into v_plan from plans where id=p_plan_id and is_active;
  if not found or p_billing_cycle not in ('monthly','annual') then raise exception 'Forfait ou cycle invalide';end if;
  select * into v_price from plan_currency_prices pp where pp.plan_id=p_plan_id and pp.currency='GNF';
  if not found then raise exception 'Tarif GNF non configure';end if;

  base_amount:=case when p_billing_cycle='annual' then v_price.annual_price else v_price.monthly_price end;
  v_catalog_amount:=base_amount;
  discount_amount:=0;bonus_days:=0;promotion_id:=null;promotion_name:=null;currency:='GNF';
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
    elsif v_promo.promotion_type='fixed_amount' then discount_amount:=least(base_amount,round(v_promo.value*base_amount/nullif(v_catalog_amount,0),2));
    else bonus_days:=v_promo.value::integer;end if;
  end if;
  final_amount:=greatest(0,base_amount-discount_amount);
  return next;
end; $$;

grant execute on function public.subscription_quote(uuid,uuid,text,text) to authenticated;
revoke all on function public.subscription_quote(uuid,uuid,text,text) from anon;
