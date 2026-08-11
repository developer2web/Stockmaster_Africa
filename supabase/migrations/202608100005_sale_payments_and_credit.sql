alter table public.sales
  add column if not exists amount_paid numeric(12,2) not null default 0 check (amount_paid >= 0),
  add column if not exists amount_due numeric(12,2) not null default 0 check (amount_due >= 0),
  add column if not exists payment_status text not null default 'paid'
    check (payment_status in ('paid', 'partial', 'credit'));

update public.sales
set amount_paid = total, amount_due = 0, payment_status = 'paid'
where amount_paid = 0 and amount_due = 0;

-- Autorise les deux états métier supplémentaires dans l'implémentation auditée.
do $migration$
declare definition text; updated text;
begin
  definition := pg_get_functiondef('public.create_sale(uuid,text,jsonb,uuid,uuid)'::regprocedure);
  updated := replace(
    definition,
    $find$p_payment_method not in ('cash','card','mobile_money','bank_transfer','mixed')$find$,
    $replace$p_payment_method not in ('cash','card','mobile_money','bank_transfer','mixed','credit','partial')$replace$
  );
  if updated = definition then raise exception 'Validation des moyens de paiement introuvable'; end if;
  execute updated;
end
$migration$;

create or replace function public.sync_sale_to_cash()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.amount_paid <= 0 then
    delete from cash_transactions where sale_id = new.id;
    return new;
  end if;
  insert into cash_transactions(
    company_id,store_id,transaction_type,designation,amount,sale_id,source,payment_method,created_by,created_at
  ) values(
    new.company_id,new.store_id,'deposit','Vente '||coalesce(new.reference,new.id::text),
    new.amount_paid,new.id,'sale',new.payment_method,new.created_by,new.created_at
  ) on conflict(sale_id) where sale_id is not null do update set
    store_id=excluded.store_id, designation=excluded.designation, amount=excluded.amount,
    payment_method=excluded.payment_method, updated_at=now();
  return new;
end $$;

drop trigger if exists sync_sale_cash on public.sales;
create trigger sync_sale_cash
after insert or update of total,amount_paid,reference,payment_method,store_id
on public.sales for each row execute function public.sync_sale_to_cash();

create or replace function public.create_sale_v2(
  p_store_id uuid, p_payment_method text, p_items jsonb,
  p_customer_id uuid default null, p_amount_paid numeric default null,
  p_operation_id uuid default gen_random_uuid()
) returns table(sale_id uuid, reference text, total numeric, gross_profit numeric,
  amount_paid numeric, amount_due numeric, payment_status text)
language plpgsql security definer set search_path=public as $$
declare result record; paid numeric; due numeric; status text;
begin
  select * into result from public.create_sale(
    p_store_id,p_payment_method,p_items,p_customer_id,p_operation_id
  );
  paid := least(result.total, greatest(0, coalesce(p_amount_paid, result.total)));
  due := result.total - paid;
  if due > 0 and p_customer_id is null then
    raise exception 'Un client est obligatoire pour une vente avec dette';
  end if;
  status := case when due = 0 then 'paid' when paid = 0 then 'credit' else 'partial' end;
  update sales set amount_paid=paid, amount_due=due, payment_status=status where id=result.sale_id;
  if due > 0 and not exists(select 1 from customer_ledger where sale_id=result.sale_id and entry_type='credit') then
    insert into customer_ledger(company_id,customer_id,store_id,entry_type,amount,sale_id,note,created_by)
    select company_id,p_customer_id,store_id,'credit',due,id,'Crédit vente '||reference,auth.uid()
    from sales where id=result.sale_id;
  end if;
  sale_id:=result.sale_id;reference:=result.reference;total:=result.total;gross_profit:=result.gross_profit;
  amount_paid:=paid;amount_due:=due;payment_status:=status;return next;
end $$;
grant execute on function public.create_sale_v2(uuid,text,jsonb,uuid,numeric,uuid) to authenticated;
revoke all on function public.create_sale_v2(uuid,text,jsonb,uuid,numeric,uuid) from anon;
