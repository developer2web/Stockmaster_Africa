alter table public.companies add column if not exists loyalty_enabled boolean not null default true;
alter table public.companies add column if not exists loyalty_amount_per_point numeric(12,2) not null default 10000 check(loyalty_amount_per_point>0);

create table public.customer_loyalty_accounts(
  customer_id uuid primary key references public.customers(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  points integer not null default 0 check(points>=0),
  lifetime_earned integer not null default 0 check(lifetime_earned>=0),
  updated_at timestamptz not null default now()
);
create table public.customer_loyalty_transactions(
  id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,sale_id uuid references public.sales(id) on delete cascade,
  return_id uuid references public.sale_returns(id) on delete cascade,points integer not null,note text,created_at timestamptz not null default now(),
  check(points<>0),unique(sale_id),unique(return_id)
);
alter table public.customer_loyalty_accounts enable row level security;alter table public.customer_loyalty_transactions enable row level security;
create policy loyalty_accounts_read on public.customer_loyalty_accounts for select to authenticated using(public.belongs_to_company(company_id) and public.has_permission(company_id,'customers.read'));
create policy loyalty_transactions_read on public.customer_loyalty_transactions for select to authenticated using(public.belongs_to_company(company_id) and public.has_permission(company_id,'customers.read'));
grant select on public.customer_loyalty_accounts,public.customer_loyalty_transactions to authenticated;
revoke insert,update,delete on public.customer_loyalty_accounts,public.customer_loyalty_transactions from anon,authenticated;

create or replace function public.apply_sale_loyalty() returns trigger language plpgsql security definer set search_path=public as $$
declare v_rate numeric;v_enabled boolean;v_points integer;
begin
  if new.customer_id is null then return new;end if;
  select loyalty_enabled,loyalty_amount_per_point into v_enabled,v_rate from companies where id=new.company_id;
  if not v_enabled then return new;end if;v_points:=floor(new.total/v_rate);
  if v_points<=0 then return new;end if;
  insert into customer_loyalty_transactions(company_id,customer_id,sale_id,points,note) values(new.company_id,new.customer_id,new.id,v_points,'Points sur vente '||coalesce(new.reference,new.id::text)) on conflict(sale_id) do nothing;
  if found then insert into customer_loyalty_accounts(customer_id,company_id,points,lifetime_earned) values(new.customer_id,new.company_id,v_points,v_points) on conflict(customer_id) do update set points=customer_loyalty_accounts.points+excluded.points,lifetime_earned=customer_loyalty_accounts.lifetime_earned+excluded.points,updated_at=now();end if;
  return new;
end $$;
create trigger award_sale_loyalty after insert on public.sales for each row execute function public.apply_sale_loyalty();

create or replace function public.apply_return_loyalty() returns trigger language plpgsql security definer set search_path=public as $$
declare v_customer uuid;v_rate numeric;v_points integer;v_current integer;
begin
  select customer_id into v_customer from sales where id=new.sale_id;if v_customer is null then return new;end if;
  select loyalty_amount_per_point into v_rate from companies where id=new.company_id;v_points:=floor(new.total/v_rate);if v_points<=0 then return new;end if;
  select points into v_current from customer_loyalty_accounts where customer_id=v_customer for update;v_points:=least(v_points,coalesce(v_current,0));if v_points<=0 then return new;end if;
  insert into customer_loyalty_transactions(company_id,customer_id,return_id,points,note) values(new.company_id,v_customer,new.id,-v_points,'Correction après retour') on conflict(return_id) do nothing;
  if found then update customer_loyalty_accounts set points=points-v_points,updated_at=now() where customer_id=v_customer;end if;return new;
end $$;
create trigger reverse_return_loyalty after update of total on public.sale_returns for each row when(new.total is distinct from old.total) execute function public.apply_return_loyalty();
