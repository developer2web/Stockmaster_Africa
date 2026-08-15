alter table public.customer_ledger
  add column if not exists balance_before numeric(12,2),
  add column if not exists balance_after numeric(12,2);

alter table public.supplier_payments
  add column if not exists balance_before numeric(12,2),
  add column if not exists balance_after numeric(12,2);

create or replace function public.record_customer_entry(
  p_customer_id uuid,p_store_id uuid,p_entry_type text,p_amount numeric,
  p_note text default null,p_sale_id uuid default null,p_operation_id uuid default gen_random_uuid()
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_company uuid;v_entry uuid;v_before numeric;v_after numeric;
begin
  if p_entry_type not in ('credit','payment') then raise exception 'Type d''écriture invalide';end if;
  if p_amount is null or p_amount<=0 then raise exception 'Le montant doit être supérieur à zéro';end if;
  select company_id into v_company from customers where id=p_customer_id;
  if v_company is null or not public.belongs_to_company(v_company) or not public.has_active_subscription(v_company) or not (public.is_company_admin(v_company) or public.has_permission(v_company,'sales.write')) then raise exception 'Accès refusé ou abonnement inactif';end if;
  if p_store_id is not null and not exists(select 1 from stores where id=p_store_id and company_id=v_company and public.can_access_store(v_company,id)) then raise exception 'Boutique invalide';end if;
  perform pg_advisory_xact_lock(hashtextextended(p_customer_id::text,0));
  select id into v_entry from customer_ledger where operation_id=p_operation_id;
  if v_entry is not null then return v_entry;end if;
  select coalesce(sum(case when entry_type='credit' then amount else -amount end),0) into v_before from customer_ledger where customer_id=p_customer_id;
  if p_entry_type='payment' and p_amount>v_before then raise exception 'Le paiement dépasse la dette restante (%)',v_before;end if;
  v_after:=v_before+case when p_entry_type='credit' then p_amount else -p_amount end;
  insert into customer_ledger(company_id,customer_id,store_id,entry_type,amount,sale_id,note,operation_id,created_by,balance_before,balance_after)
  values(v_company,p_customer_id,p_store_id,p_entry_type,p_amount,p_sale_id,nullif(trim(p_note),''),p_operation_id,auth.uid(),v_before,v_after) returning id into v_entry;
  return v_entry;
end $$;

create or replace function public.record_supplier_payment(
  p_store_id uuid,p_supplier_id uuid,p_amount numeric,p_payment_method text,
  p_note text default null,p_operation_id uuid default gen_random_uuid()
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_company uuid;v_payment uuid;v_cash uuid;v_total_due numeric;v_remaining numeric;v_allocate numeric;v_purchase record;v_supplier_name text;
begin
  if p_operation_id is null or p_amount is null or p_amount<=0 then raise exception 'Montant ou identifiant invalide';end if;
  if p_payment_method not in ('cash','mobile_money','card','bank_transfer') then raise exception 'Moyen de paiement invalide';end if;
  select company_id,name into v_company,v_supplier_name from suppliers where id=p_supplier_id and store_id=p_store_id and is_active;
  if v_company is null or not public.belongs_to_company(v_company) or not public.can_access_store(v_company,p_store_id) or not public.has_active_subscription(v_company) or not (public.is_business_owner(v_company) or public.has_permission(v_company,'purchases.read') or public.has_permission(v_company,'suppliers.write')) or not (public.is_business_owner(v_company) or public.has_permission(v_company,'cash_transactions.write') or public.has_permission(v_company,'expenses.write')) then raise exception 'Accès au règlement fournisseur refusé';end if;
  perform public.lock_operation(p_operation_id);
  perform pg_advisory_xact_lock(hashtextextended(p_supplier_id::text,0));
  select id into v_payment from supplier_payments where company_id=v_company and operation_id=p_operation_id;if v_payment is not null then return v_payment;end if;
  select coalesce(sum(amount_due),0) into v_total_due from purchases where company_id=v_company and store_id=p_store_id and supplier_id=p_supplier_id and amount_due>0;
  if v_total_due<=0 then raise exception 'Ce fournisseur n''a aucune dette à régler';end if;
  if p_amount>v_total_due then raise exception 'Le paiement dépasse la dette fournisseur restante (%)',v_total_due;end if;
  insert into cash_transactions(company_id,store_id,transaction_type,designation,amount,source,payment_method,operation_id,created_by) values(v_company,p_store_id,'withdrawal','Paiement fournisseur '||v_supplier_name,p_amount,'supplier_payment',p_payment_method,p_operation_id,auth.uid()) returning id into v_cash;
  insert into supplier_payments(company_id,store_id,supplier_id,amount,payment_method,note,operation_id,cash_transaction_id,created_by,balance_before,balance_after) values(v_company,p_store_id,p_supplier_id,p_amount,p_payment_method,nullif(trim(p_note),''),p_operation_id,v_cash,auth.uid(),v_total_due,v_total_due-p_amount) returning id into v_payment;
  v_remaining:=p_amount;
  for v_purchase in select id,amount_due from purchases where company_id=v_company and store_id=p_store_id and supplier_id=p_supplier_id and amount_due>0 order by created_at,id for update loop
    exit when v_remaining<=0;v_allocate:=least(v_remaining,v_purchase.amount_due);
    insert into supplier_payment_allocations(company_id,supplier_payment_id,purchase_id,amount) values(v_company,v_payment,v_purchase.id,v_allocate);
    update purchases set amount_paid=amount_paid+v_allocate,amount_due=amount_due-v_allocate,payment_status=case when amount_due-v_allocate=0 then 'paid' else 'partial' end where id=v_purchase.id;
    v_remaining:=v_remaining-v_allocate;
  end loop;
  return v_payment;
end $$;
