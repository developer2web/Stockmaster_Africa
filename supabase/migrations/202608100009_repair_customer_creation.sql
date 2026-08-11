-- Repair installations where `customers` already existed before the ardoise
-- migration. CREATE TABLE IF NOT EXISTS does not add missing columns.
alter table public.customers
  add column if not exists store_id uuid references public.stores(id) on delete set null,
  add column if not exists address text,
  add column if not exists note text,
  add column if not exists is_active boolean not null default true;

create index if not exists customers_store_idx
  on public.customers(store_id);

-- Keep a selected store inside the customer's company boundary.
create or replace function public.validate_customer_store()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.store_id is not null and not exists (
    select 1 from public.stores s
    where s.id = new.store_id and s.company_id = new.company_id
  ) then
    raise exception 'Boutique invalide pour cette entreprise';
  end if;
  return new;
end
$$;

drop trigger if exists validate_customer_store on public.customers;
create trigger validate_customer_store
before insert or update of company_id, store_id on public.customers
for each row execute function public.validate_customer_store();

grant select, insert, update, delete on public.customers to authenticated;
