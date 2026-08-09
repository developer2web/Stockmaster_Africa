-- =====================================================================
-- Module Clients + Ardoise (crédit) + Historique d'achat
-- ---------------------------------------------------------------------
-- - Table `customers` (fiche client, rattachée à l'entreprise/boutique)
-- - Table `customer_ledger` (ardoise : écritures "credit" = dette,
--   "payment" = remboursement) alimentée via un RPC atomique idempotent
-- - Vue `customer_balances` (solde dû par client, sécurité par invocateur)
-- - Lien `sales.customer_id -> customers(id)` pour l'historique d'achat
--
-- Dépend de `is_company_admin` (migration 202608100001).
-- =====================================================================

-- 1. Fiche client ---------------------------------------------------------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  store_id uuid references public.stores(id) on delete set null,
  name text not null,
  phone text,
  email text,
  address text,
  note text,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists customers_company_idx on public.customers(company_id);
create index if not exists customers_company_name_idx on public.customers(company_id, lower(name));

alter table public.customers enable row level security;

drop policy if exists customers_select on public.customers;
create policy customers_select on public.customers
  for select to authenticated
  using (public.belongs_to_company(company_id));

drop policy if exists customers_write on public.customers;
create policy customers_write on public.customers
  for all to authenticated
  using (
    public.belongs_to_company(company_id)
    and (public.is_company_admin(company_id) or public.has_permission(company_id, 'sales.write'))
  )
  with check (
    public.belongs_to_company(company_id)
    and public.has_active_subscription(company_id)
    and (public.is_company_admin(company_id) or public.has_permission(company_id, 'sales.write'))
  );

grant select, insert, update, delete on public.customers to authenticated;

-- 2. Ardoise (grand livre client) -----------------------------------------
create table if not exists public.customer_ledger (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  store_id uuid references public.stores(id) on delete set null,
  entry_type text not null check (entry_type in ('credit', 'payment')),
  amount numeric(12,2) not null check (amount > 0),
  sale_id uuid,
  note text,
  operation_id uuid not null default gen_random_uuid(),
  created_by uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists customer_ledger_operation_unique on public.customer_ledger(operation_id);
create index if not exists customer_ledger_customer_idx on public.customer_ledger(customer_id, created_at desc);

alter table public.customer_ledger enable row level security;

-- Lecture par tenant ; les écritures passent obligatoirement par le RPC.
drop policy if exists customer_ledger_select on public.customer_ledger;
create policy customer_ledger_select on public.customer_ledger
  for select to authenticated
  using (public.belongs_to_company(company_id));

grant select on public.customer_ledger to authenticated;

-- 3. RPC atomique idempotent pour l'ardoise -------------------------------
create or replace function public.record_customer_entry(
  p_customer_id uuid,
  p_store_id uuid,
  p_entry_type text,
  p_amount numeric,
  p_note text default null,
  p_sale_id uuid default null,
  p_operation_id uuid default gen_random_uuid()
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_entry uuid;
begin
  if p_entry_type not in ('credit', 'payment') then
    raise exception 'Type d''écriture invalide';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Le montant doit être supérieur à zéro';
  end if;

  select m.company_id into v_company
  from memberships m
  join roles r on r.id = m.role_id
  where m.user_id = auth.uid()
    and m.is_active
    and (r.code = 'company_admin' or public.has_permission(m.company_id, 'sales.write'))
  limit 1;

  if v_company is null or not public.has_active_subscription(v_company) then
    raise exception 'Accès refusé ou abonnement inactif';
  end if;
  if not exists (select 1 from customers c where c.id = p_customer_id and c.company_id = v_company) then
    raise exception 'Client invalide';
  end if;
  if p_store_id is not null and not exists (
    select 1 from stores s where s.id = p_store_id and s.company_id = v_company
  ) then
    raise exception 'Boutique invalide';
  end if;

  -- Idempotence : rejoue la même opération sans double comptage.
  select id into v_entry from customer_ledger where operation_id = p_operation_id;
  if v_entry is not null then
    return v_entry;
  end if;

  insert into customer_ledger(company_id, customer_id, store_id, entry_type, amount, sale_id, note, operation_id, created_by)
  values (v_company, p_customer_id, p_store_id, p_entry_type, p_amount, p_sale_id, nullif(trim(p_note), ''), p_operation_id, auth.uid())
  returning id into v_entry;

  return v_entry;
end $$;

grant execute on function public.record_customer_entry(uuid, uuid, text, numeric, text, uuid, uuid) to authenticated;
revoke all on function public.record_customer_entry(uuid, uuid, text, numeric, text, uuid, uuid) from anon;

-- 4. Vue des soldes (ardoise due par client) ------------------------------
-- security_invoker = on -> la RLS des tables de base s'applique (tenant-safe).
create or replace view public.customer_balances
with (security_invoker = on) as
  select c.id as customer_id,
         c.company_id,
         coalesce(sum(
           case l.entry_type
             when 'credit' then l.amount
             when 'payment' then -l.amount
             else 0
           end
         ), 0)::numeric(12,2) as balance
  from public.customers c
  left join public.customer_ledger l on l.customer_id = c.id
  group by c.id, c.company_id;

grant select on public.customer_balances to authenticated;

-- 5. Lien ventes -> clients (historique d'achat) --------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sales_customer_id_fkey') then
    alter table public.sales
      add constraint sales_customer_id_fkey
      foreign key (customer_id) references public.customers(id) on delete set null;
  end if;
end $$;
