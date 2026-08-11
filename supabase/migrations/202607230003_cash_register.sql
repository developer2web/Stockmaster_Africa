-- Caisse : approvisionnements et décaissements, séparés par entreprise et boutique.
create type public.cash_transaction_type as enum ('deposit','withdrawal');
create table public.cash_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  store_id uuid references public.stores(id) on delete set null,
  transaction_type public.cash_transaction_type not null,
  designation text not null,
  amount numeric(12,2) not null check(amount > 0),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cash_transactions_company_created_idx on public.cash_transactions(company_id,created_at desc);
create trigger touch_updated_at before update on public.cash_transactions for each row execute function public.touch_updated_at();
create trigger audit_cash_transactions after insert or update or delete on public.cash_transactions
for each row execute function public.write_audit_log();
insert into permissions(code,description) values
  ('cash_transactions.read','Consulter la caisse'),
  ('cash_transactions.write','Gérer la caisse')
on conflict(code) do update set description=excluded.description;
alter table public.cash_transactions enable row level security;
create policy cash_transactions_select on public.cash_transactions for select to authenticated
using(
  public.belongs_to_company(company_id)
  and (public.has_permission(company_id,'cash_transactions.read') or public.has_permission(company_id,'expenses.read'))
  and public.can_access_store(company_id,store_id)
);
create policy cash_transactions_insert on public.cash_transactions for insert to authenticated
with check(
  public.belongs_to_company(company_id)
  and public.has_active_subscription(company_id)
  and (public.has_permission(company_id,'cash_transactions.write') or public.has_permission(company_id,'expenses.write'))
  and public.can_access_store(company_id,store_id)
);
create policy cash_transactions_update on public.cash_transactions for update to authenticated
using(
  public.belongs_to_company(company_id)
  and public.has_active_subscription(company_id)
  and (public.has_permission(company_id,'cash_transactions.write') or public.has_permission(company_id,'expenses.write'))
  and public.can_access_store(company_id,store_id)
);
create policy cash_transactions_delete on public.cash_transactions for delete to authenticated
using(
  public.belongs_to_company(company_id)
  and public.has_active_subscription(company_id)
  and (public.has_permission(company_id,'cash_transactions.write') or public.has_permission(company_id,'expenses.write'))
  and public.can_access_store(company_id,store_id)
);
