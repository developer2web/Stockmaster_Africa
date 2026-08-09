-- Retry-safe financial operations and controlled client telemetry.

alter table public.cash_transactions
  add column if not exists operation_id uuid;
alter table public.expenses
  add column if not exists operation_id uuid;

create unique index if not exists cash_transactions_operation_unique
  on public.cash_transactions(company_id, operation_id)
  where operation_id is not null;
create unique index if not exists expenses_operation_unique
  on public.expenses(company_id, operation_id)
  where operation_id is not null;

-- Serialize retries for sale operation ids. The existing create_sale function
-- already returns the previous sale when operation_id exists; this lock closes
-- the race between the lookup and insert for simultaneous requests.
create or replace function public.lock_operation(p_operation_id uuid)
returns void
language sql
volatile
set search_path=public
as $$
  select pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0))
$$;

revoke all on function public.lock_operation(uuid) from public, anon, authenticated;

create or replace function public.record_stock_movement(
  p_product_id uuid,
  p_store_id uuid,
  p_delta numeric,
  p_movement_type text,
  p_note text default null,
  p_variant_id uuid default null,
  p_operation_id uuid default gen_random_uuid()
) returns table(movement_id uuid, new_quantity numeric)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_company uuid;
  v_level uuid;
  v_current numeric;
begin
  if p_delta=0 then raise exception 'La quantité doit être différente de zéro'; end if;
  if p_movement_type not in (
    'initial','adjustment_in','adjustment_out','purchase','sale',
    'transfer_in','transfer_out','inventory'
  ) then raise exception 'Type de mouvement invalide'; end if;

  select m.company_id into v_company
  from memberships m
  join roles r on r.id=m.role_id
  where m.user_id=auth.uid()
    and m.is_active
    and m.company_id=(select company_id from stores where id=p_store_id)
    and (
      r.code='company_admin'
      or public.has_permission(m.company_id,'stock_movements.write')
    )
  limit 1;

  if v_company is null or not public.has_active_subscription(v_company) then
    raise exception 'Accès refusé ou abonnement inactif';
  end if;
  if not public.can_access_store(v_company,p_store_id) then
    raise exception 'Cette boutique ne vous est pas attribuée';
  end if;
  if not exists(
    select 1 from products
    where id=p_product_id and company_id=v_company and is_active
  ) then raise exception 'Produit invalide'; end if;
  if p_variant_id is not null and not exists(
    select 1 from product_variants
    where id=p_variant_id and product_id=p_product_id
      and company_id=v_company and is_active
  ) then raise exception 'Variante invalide'; end if;

  perform public.lock_operation(p_operation_id);

  select sm.id,sl.quantity into movement_id,new_quantity
  from stock_movements sm
  join stock_levels sl
    on sl.company_id=sm.company_id
   and sl.store_id=sm.store_id
   and sl.product_id=sm.product_id
   and sl.product_variant_id is not distinct from sm.product_variant_id
  where sm.operation_id=p_operation_id and sm.company_id=v_company;
  if movement_id is not null then return next; return; end if;

  insert into stock_levels(
    company_id,store_id,product_id,product_variant_id,quantity,created_by
  ) values(
    v_company,p_store_id,p_product_id,p_variant_id,0,auth.uid()
  ) on conflict(
    company_id,store_id,product_id,product_variant_id
  ) do nothing;

  select id,quantity into v_level,v_current
  from stock_levels
  where company_id=v_company
    and store_id=p_store_id
    and product_id=p_product_id
    and product_variant_id is not distinct from p_variant_id
  for update;

  if v_current+p_delta<0 then
    raise exception 'Stock insuffisant : quantité disponible %',v_current;
  end if;

  update stock_levels
  set quantity=quantity+p_delta
  where id=v_level
  returning quantity into new_quantity;

  insert into stock_movements(
    company_id,store_id,product_id,product_variant_id,quantity,
    movement_type,operation_id,note,created_by
  ) values(
    v_company,p_store_id,p_product_id,p_variant_id,p_delta,
    p_movement_type,p_operation_id,nullif(trim(p_note),''),auth.uid()
  ) returning id into movement_id;
  return next;
end
$$;

-- Add the serialization call to the current audited sale implementation without
-- duplicating its business logic in this migration.
do $migration$
declare definition text;
begin
  definition := pg_get_functiondef(
    'public.create_sale(uuid,text,jsonb,uuid,uuid)'::regprocedure
  );
  if position('public.lock_operation(p_operation_id)' in definition) = 0 then
    definition := regexp_replace(
      definition,
      E'(\n[[:space:]]*begin[[:space:]]*\n)',
      E'\\1  perform public.lock_operation(p_operation_id);\n',
      'i'
    );
    execute definition;
  end if;
end
$migration$;

drop function if exists public.record_cash_transaction(
  uuid, public.cash_transaction_type, text, numeric
);

create function public.record_cash_transaction(
  p_store_id uuid,
  p_transaction_type public.cash_transaction_type,
  p_designation text,
  p_amount numeric,
  p_operation_id uuid
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_company uuid;
  v_id uuid;
begin
  if p_operation_id is null then raise exception 'Identifiant d''opération requis'; end if;
  if length(trim(p_designation))<2 then raise exception 'Désignation requise'; end if;
  if p_amount<=0 then raise exception 'Le montant doit être positif'; end if;

  select m.company_id into v_company
  from memberships m
  join roles r on r.id=m.role_id
  join companies c on c.id=m.company_id
  where m.user_id=auth.uid()
    and m.is_active
    and c.is_active
    and (p_store_id is null or m.company_id=(
      select company_id from stores where id=p_store_id
    ))
    and (
      r.code='company_admin'
      or public.has_permission(m.company_id,'cash_transactions.write')
      or public.has_permission(m.company_id,'expenses.write')
    )
  limit 1;

  if v_company is null or not public.has_active_subscription(v_company) then
    raise exception 'Accès refusé';
  end if;
  if p_store_id is not null and (
    not exists(
      select 1 from stores
      where id=p_store_id and company_id=v_company and is_active
    )
    or not public.can_access_store(v_company,p_store_id)
  ) then
    raise exception 'Boutique invalide ou non autorisée';
  end if;

  perform public.lock_operation(p_operation_id);

  if p_transaction_type='withdrawal' then
    select id into v_id from expenses
    where company_id=v_company and operation_id=p_operation_id;
    if v_id is not null then return v_id; end if;

    insert into expenses(
      company_id,store_id,label,amount,expense_date,operation_id,created_by
    ) values(
      v_company,p_store_id,trim(p_designation),p_amount,current_date,
      p_operation_id,auth.uid()
    ) returning id into v_id;
  else
    select id into v_id from cash_transactions
    where company_id=v_company and operation_id=p_operation_id;
    if v_id is not null then return v_id; end if;

    insert into cash_transactions(
      company_id,store_id,transaction_type,designation,amount,source,
      operation_id,created_by
    ) values(
      v_company,p_store_id,'deposit',trim(p_designation),p_amount,'manual',
      p_operation_id,auth.uid()
    ) returning id into v_id;
  end if;
  return v_id;
end
$$;

grant execute on function public.record_cash_transaction(
  uuid, public.cash_transaction_type, text, numeric, uuid
) to authenticated;
revoke all on function public.record_cash_transaction(
  uuid, public.cash_transaction_type, text, numeric, uuid
) from anon;

create table public.app_error_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  severity text not null check(severity in ('warning','error','fatal')),
  code text not null,
  message text not null,
  context jsonb not null default '{}'::jsonb,
  platform text,
  app_version text,
  created_at timestamptz not null default now()
);

create index app_error_events_created_idx
  on public.app_error_events(created_at desc);
create index app_error_events_company_created_idx
  on public.app_error_events(company_id,created_at desc);

alter table public.app_error_events enable row level security;

create policy app_error_events_super_admin_select
on public.app_error_events for select to authenticated
using(public.is_super_admin());

create or replace function public.log_app_error(
  p_severity text,
  p_code text,
  p_message text,
  p_context jsonb default '{}'::jsonb,
  p_company_id uuid default null,
  p_platform text default null,
  p_app_version text default null
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_severity not in ('warning','error','fatal') then
    raise exception 'Invalid severity';
  end if;
  if p_company_id is not null and not public.belongs_to_company(p_company_id) then
    raise exception 'Access denied';
  end if;
  insert into app_error_events(
    user_id,company_id,severity,code,message,context,platform,app_version
  ) values(
    auth.uid(),p_company_id,p_severity,left(p_code,80),left(p_message,1000),
    coalesce(p_context,'{}'::jsonb),left(p_platform,40),left(p_app_version,40)
  ) returning id into v_id;
  return v_id;
end
$$;

grant execute on function public.log_app_error(
  text,text,text,jsonb,uuid,text,text
) to authenticated;
revoke all on function public.log_app_error(
  text,text,text,jsonb,uuid,text,text
) from anon;
