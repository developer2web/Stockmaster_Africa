-- Liaison comptable : ventes -> entrées de caisse, dépenses -> sorties de caisse.
alter table public.cash_transactions
  add column if not exists sale_id uuid references public.sales(id) on delete cascade,
  add column if not exists expense_id uuid references public.expenses(id) on delete cascade,
  add column if not exists source text not null default 'manual',
  add column if not exists payment_method text;
create unique index if not exists cash_transactions_sale_unique
  on public.cash_transactions(sale_id) where sale_id is not null;
create unique index if not exists cash_transactions_expense_unique
  on public.cash_transactions(expense_id) where expense_id is not null;
create or replace function public.sync_sale_to_cash()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.total<=0 then return new; end if;
  insert into cash_transactions(
    company_id,store_id,transaction_type,designation,amount,sale_id,source,payment_method,created_by,created_at
  ) values(
    new.company_id,new.store_id,'deposit',
    'Vente '||coalesce(new.reference,new.id::text),
    new.total,new.id,'sale',new.payment_method,new.created_by,new.created_at
  )
  on conflict(sale_id) where sale_id is not null do update set
    store_id=excluded.store_id,
    designation=excluded.designation,
    amount=excluded.amount,
    payment_method=excluded.payment_method,
    updated_at=now();
  return new;
end
$$;
create or replace function public.sync_expense_to_cash()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  insert into cash_transactions(
    company_id,store_id,transaction_type,designation,amount,expense_id,source,created_by,created_at
  ) values(
    new.company_id,new.store_id,'withdrawal',new.label,new.amount,new.id,'expense',new.created_by,
    greatest(new.created_at,new.expense_date::timestamptz)
  )
  on conflict(expense_id) where expense_id is not null do update set
    store_id=excluded.store_id,
    designation=excluded.designation,
    amount=excluded.amount,
    updated_at=now();
  return new;
end
$$;
drop trigger if exists sync_sale_cash on public.sales;
create trigger sync_sale_cash after insert or update of total,reference,payment_method,store_id
on public.sales for each row execute function public.sync_sale_to_cash();
drop trigger if exists sync_expense_cash on public.expenses;
create trigger sync_expense_cash after insert or update of amount,label,store_id,expense_date
on public.expenses for each row execute function public.sync_expense_to_cash();
create or replace function public.record_cash_transaction(
  p_store_id uuid,
  p_transaction_type public.cash_transaction_type,
  p_designation text,
  p_amount numeric
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare v_company uuid;v_id uuid;
begin
  if length(trim(p_designation))<2 then raise exception 'Désignation requise'; end if;
  if p_amount<=0 then raise exception 'Le montant doit être positif'; end if;
  select m.company_id into v_company
  from memberships m join roles r on r.id=m.role_id join companies c on c.id=m.company_id
  where m.user_id=auth.uid() and m.is_active and c.is_active
    and (r.code='company_admin' or public.has_permission(m.company_id,'cash_transactions.write') or public.has_permission(m.company_id,'expenses.write'))
  limit 1;
  if v_company is null or not public.has_active_subscription(v_company) then raise exception 'Accès refusé'; end if;
  if p_store_id is not null and (
    not exists(select 1 from stores where id=p_store_id and company_id=v_company and is_active)
    or not public.can_access_store(v_company,p_store_id)
  ) then raise exception 'Boutique invalide ou non autorisée'; end if;

  if p_transaction_type='withdrawal' then
    insert into expenses(company_id,store_id,label,amount,expense_date,created_by)
    values(v_company,p_store_id,trim(p_designation),p_amount,current_date,auth.uid())
    returning id into v_id;
  else
    insert into cash_transactions(company_id,store_id,transaction_type,designation,amount,source,created_by)
    values(v_company,p_store_id,'deposit',trim(p_designation),p_amount,'manual',auth.uid())
    returning id into v_id;
  end if;
  return v_id;
end
$$;
grant execute on function public.record_cash_transaction(uuid,public.cash_transaction_type,text,numeric) to authenticated;
revoke all on function public.record_cash_transaction(uuid,public.cash_transaction_type,text,numeric) from anon;
-- Synchronise les données déjà présentes avant cette migration.
insert into cash_transactions(
  company_id,store_id,transaction_type,designation,amount,sale_id,source,payment_method,created_by,created_at
)
select company_id,store_id,'deposit','Vente '||coalesce(reference,id::text),total,id,'sale',payment_method,created_by,created_at
from sales
on conflict(sale_id) where sale_id is not null do nothing;
insert into cash_transactions(
  company_id,store_id,transaction_type,designation,amount,expense_id,source,created_by,created_at
)
select company_id,store_id,'withdrawal',label,amount,id,'expense',created_by,
  greatest(created_at,expense_date::timestamptz)
from expenses
on conflict(expense_id) where expense_id is not null do nothing;
