-- Multiple cash closures, mandatory handover validation, and safe sale detail access.

alter table public.cash_closures
  drop constraint if exists cash_closures_store_id_closure_date_key;

create index if not exists cash_closures_store_created_idx
  on public.cash_closures(store_id, created_at desc);

create table if not exists public.cash_openings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  last_closure_id uuid not null unique references public.cash_closures(id) on delete restrict,
  expected_amount numeric(14,2) not null,
  counted_amount numeric(14,2) not null check (counted_amount >= 0),
  difference numeric(14,2) generated always as (counted_amount - expected_amount) stored,
  note text,
  opened_by uuid not null references public.profiles(id),
  opened_by_label text not null,
  created_at timestamptz not null default now()
);

alter table public.cash_openings enable row level security;
drop policy if exists cash_openings_read on public.cash_openings;
create policy cash_openings_read on public.cash_openings for select to authenticated
using (public.belongs_to_company(company_id) and public.can_access_store(company_id, store_id));
revoke insert, update, delete on public.cash_openings from anon, authenticated;
grant select on public.cash_openings to authenticated;

create or replace function public.get_store_cash_session_status(p_store_id uuid)
returns table(requires_opening boolean, closure_id uuid, expected_initial numeric,
  closed_at timestamptz, closed_by_label text)
language sql stable security definer set search_path=public as $$
  with latest as (
    select cc.id, cc.counted_amount, cc.created_at, cc.closed_by_label
    from public.cash_closures cc
    join public.stores s on s.id=cc.store_id
    where cc.store_id=p_store_id
      and public.can_access_store(s.company_id, s.id)
    order by cc.created_at desc limit 1
  )
  select (l.id is not null and o.id is null), l.id, l.counted_amount,
         l.created_at, l.closed_by_label
  from latest l left join public.cash_openings o on o.last_closure_id=l.id
  union all
  select false, null::uuid, 0::numeric, null::timestamptz, null::text
  where not exists(select 1 from latest);
$$;

create or replace function public.open_store_cash(
  p_store_id uuid, p_counted_amount numeric, p_note text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_company uuid; v_closure public.cash_closures%rowtype; v_id uuid; v_label text;
begin
  select company_id into v_company from public.stores where id=p_store_id and is_active;
  if v_company is null or not public.can_access_store(v_company,p_store_id)
     or not (public.has_permission(v_company,'cash_transactions.write') or public.has_permission(v_company,'expenses.write')) then
    raise exception 'Accès refusé';
  end if;
  if p_counted_amount is null or p_counted_amount < 0 then raise exception 'Le montant initial est invalide'; end if;
  select * into v_closure from public.cash_closures
    where store_id=p_store_id order by created_at desc limit 1 for update;
  if v_closure.id is null then raise exception 'Aucune clôture à reprendre'; end if;
  if exists(select 1 from public.cash_openings where last_closure_id=v_closure.id) then
    raise exception 'Cette reprise de caisse a déjà été validée';
  end if;
  select case when r.code='company_admin' then 'Administrateur'
    else coalesce(nullif(trim(p.full_name),''),'Employé') end into v_label
  from public.memberships m join public.roles r on r.id=m.role_id
  join public.profiles p on p.id=m.user_id
  where m.user_id=auth.uid() and m.company_id=v_company and m.is_active
  order by case when r.code='company_admin' then 0 else 1 end limit 1;
  insert into public.cash_openings(company_id,store_id,last_closure_id,expected_amount,
    counted_amount,note,opened_by,opened_by_label)
  values(v_company,p_store_id,v_closure.id,v_closure.counted_amount,p_counted_amount,
    nullif(trim(p_note),''),auth.uid(),coalesce(v_label,'Employé')) returning id into v_id;
  insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by)
  values(v_company,auth.uid(),'open_cash','cash_openings',v_id,
    jsonb_build_object('expected',v_closure.counted_amount,'counted',p_counted_amount,
      'difference',p_counted_amount-v_closure.counted_amount),auth.uid());
  return v_id;
end $$;

grant execute on function public.get_store_cash_session_status(uuid) to authenticated;
grant execute on function public.open_store_cash(uuid,numeric,text) to authenticated;
revoke all on function public.get_store_cash_session_status(uuid) from anon;
revoke all on function public.open_store_cash(uuid,numeric,text) from anon;

create or replace function public.require_open_cash_session()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_closure uuid;
begin
  select id into v_closure from public.cash_closures
    where store_id=new.store_id order by created_at desc limit 1;
  if v_closure is not null and not exists(
    select 1 from public.cash_openings where last_closure_id=v_closure
  ) then raise exception 'Validez le montant initial de la caisse avant de commencer'; end if;
  return new;
end $$;

drop trigger if exists require_open_cash_session on public.cash_transactions;
create trigger require_open_cash_session before insert on public.cash_transactions
for each row execute function public.require_open_cash_session();

create or replace function public.close_store_cash(p_store_id uuid,p_counted_amount numeric,p_note text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_company uuid;v_expected numeric;v_id uuid;v_label text;v_latest uuid;
begin
  select company_id into v_company from public.stores where id=p_store_id;
  if v_company is null or not public.can_access_store(v_company,p_store_id) or not (public.has_permission(v_company,'cash_transactions.write') or public.has_permission(v_company,'expenses.write')) then raise exception 'Accès refusé';end if;
  if p_counted_amount is null or p_counted_amount<0 then raise exception 'Le montant compté ne peut pas être négatif';end if;
  select id into v_latest from public.cash_closures where store_id=p_store_id order by created_at desc limit 1;
  if v_latest is not null and not exists(select 1 from public.cash_openings where last_closure_id=v_latest) then raise exception 'Validez d’abord le montant initial de cette reprise';end if;
  select case when r.code='company_admin' then 'Administrateur' else coalesce(nullif(trim(p.full_name),''),'Employé') end into v_label from public.memberships m join public.roles r on r.id=m.role_id join public.profiles p on p.id=m.user_id where m.user_id=auth.uid() and m.company_id=v_company and m.is_active order by case when r.code='company_admin' then 0 else 1 end limit 1;
  select coalesce(sum(case when transaction_type='deposit' then amount else -amount end),0) into v_expected from public.cash_transactions where company_id=v_company and store_id=p_store_id;
  insert into public.cash_closures(company_id,store_id,expected_amount,counted_amount,note,closed_by,closed_by_label) values(v_company,p_store_id,v_expected,p_counted_amount,nullif(trim(p_note),''),auth.uid(),coalesce(v_label,'Employé')) returning id into v_id;
  insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by) values(v_company,auth.uid(),'close_cash','cash_closures',v_id,jsonb_build_object('expected',v_expected,'counted',p_counted_amount,'difference',p_counted_amount-v_expected,'closed_by',v_label),auth.uid());
  return v_id;
end $$;

create or replace function public.get_sale_detail_safe(p_sale_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'id',s.id,'company_id',s.company_id,'store_id',s.store_id,'customer_id',s.customer_id,
    'reference',s.reference,'subtotal',s.subtotal,'discount_total',s.discount_total,'total',s.total,
    'amount_paid',s.amount_paid,'amount_due',s.amount_due,'payment_status',s.payment_status,
    'currency_code',s.currency_code,'secondary_currency_code',s.secondary_currency_code,
    'secondary_exchange_rate',s.secondary_exchange_rate,'exchange_rate_effective_at',s.exchange_rate_effective_at,
    'payment_method',s.payment_method,'created_by',s.created_by,'created_at',s.created_at,
    'store',case when st.id is null then null else jsonb_build_object('name',st.name) end,
    'creator',case when pr.id is null then null else jsonb_build_object('full_name',pr.full_name) end,
    'customer',case when c.id is null then null else jsonb_build_object('name',c.name,'phone',c.phone,'email',c.email) end,
    'sale_items',coalesce((select jsonb_agg(jsonb_build_object(
      'id',si.id,'sale_id',si.sale_id,'product_id',si.product_id,'product_variant_id',si.product_variant_id,
      'sale_price',si.sale_price,'quantity',si.quantity,'discount',si.discount,'line_total',si.line_total,
      'product',jsonb_build_object('name',p.name,'sku',p.sku),
      'variant',case when pv.id is null then null else jsonb_build_object('name',pv.name,'sku',pv.sku) end
    ) order by si.created_at) from public.sale_items si join public.products p on p.id=si.product_id
      left join public.product_variants pv on pv.id=si.product_variant_id where si.sale_id=s.id),'[]'::jsonb)
  )
  from public.sales s left join public.stores st on st.id=s.store_id
  left join public.profiles pr on pr.id=s.created_by left join public.customers c on c.id=s.customer_id
  where s.id=p_sale_id and public.belongs_to_company(s.company_id)
    and public.can_access_store(s.company_id,s.store_id) and public.has_permission(s.company_id,'sales.read');
$$;

grant execute on function public.get_sale_detail_safe(uuid) to authenticated;
revoke all on function public.get_sale_detail_safe(uuid) from anon;
