-- Customer debt settlement: cash trace, FIFO sale allocation and explicit discounts.

alter table public.customer_ledger drop constraint if exists customer_ledger_entry_type_check;
alter table public.customer_ledger add constraint customer_ledger_entry_type_check
  check(entry_type in ('credit','payment','discount'));
alter table public.customer_ledger add column if not exists payment_method text
  check(payment_method is null or payment_method in ('cash','mobile_money'));

create or replace function public.sync_sale_to_cash()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if current_setting('stockmaster.debt_settlement',true)='1' then return new;end if;
  if exists(select 1 from public.cash_transactions where sale_id=new.id) then
    update public.cash_transactions set store_id=new.store_id,designation='Vente '||coalesce(new.reference,new.id::text),
      payment_method=new.payment_method,updated_at=now() where sale_id=new.id;
    return new;
  end if;
  if new.amount_paid>0 then
    insert into public.cash_transactions(company_id,store_id,transaction_type,designation,amount,sale_id,source,payment_method,created_by,created_at)
      values(new.company_id,new.store_id,'deposit','Vente '||coalesce(new.reference,new.id::text),new.amount_paid,new.id,
        'sale',new.payment_method,new.created_by,new.created_at);
  end if;
  return new;
end $$;

create table if not exists public.customer_payment_allocations(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ledger_entry_id uuid not null references public.customer_ledger(id) on delete restrict,
  sale_id uuid not null references public.sales(id) on delete restrict,
  amount numeric(12,2) not null check(amount>0),
  created_at timestamptz not null default now(),
  unique(ledger_entry_id,sale_id)
);
alter table public.customer_payment_allocations enable row level security;
create policy customer_payment_allocations_read on public.customer_payment_allocations for select to authenticated
  using(public.belongs_to_company(company_id));
grant select on public.customer_payment_allocations to authenticated;
revoke insert,update,delete on public.customer_payment_allocations from anon,authenticated;

create or replace function public.record_customer_entry_v2(
  p_customer_id uuid,p_store_id uuid,p_entry_type text,p_amount numeric,p_payment_method text default null,
  p_note text default null,p_sale_id uuid default null,p_operation_id uuid default gen_random_uuid()
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_company uuid;v_entry uuid;v_before numeric;v_after numeric;v_remaining numeric;v_allocate numeric;v_sale record;v_customer text;
begin
  if p_entry_type not in ('credit','payment','discount') then raise exception 'Type d’écriture invalide';end if;
  if p_amount is null or p_amount<=0 then raise exception 'Le montant doit être supérieur à zéro';end if;
  select company_id,name into v_company,v_customer from public.customers where id=p_customer_id and is_active;
  if v_company is null or not public.belongs_to_company(v_company) or not public.has_active_subscription(v_company)
     or not (public.is_company_admin(v_company) or public.has_permission(v_company,'sales.write')) then raise exception 'Accès refusé ou abonnement inactif';end if;
  if p_store_id is null or not exists(select 1 from public.stores where id=p_store_id and company_id=v_company and public.can_access_store(v_company,id)) then raise exception 'Boutique invalide';end if;
  if p_entry_type='discount' and not public.is_company_admin(v_company) then raise exception 'Seul un administrateur peut accorder une remise de dette';end if;
  if p_entry_type='discount' and length(trim(coalesce(p_note,'')))<3 then raise exception 'Le motif de la remise est obligatoire';end if;
  if p_entry_type='payment' and p_payment_method not in ('cash','mobile_money') then raise exception 'Moyen de paiement invalide';end if;
  perform public.lock_operation(p_operation_id);perform pg_advisory_xact_lock(hashtextextended(p_customer_id::text,0));
  select id into v_entry from public.customer_ledger where operation_id=p_operation_id;if v_entry is not null then return v_entry;end if;
  select coalesce(sum(case when entry_type='credit' then amount else -amount end),0) into v_before from public.customer_ledger where customer_id=p_customer_id;
  if p_entry_type in ('payment','discount') and p_amount>v_before then raise exception 'Le montant dépasse la dette restante (%)',v_before;end if;
  v_after:=v_before+case when p_entry_type='credit' then p_amount else -p_amount end;
  insert into public.customer_ledger(company_id,customer_id,store_id,entry_type,amount,sale_id,note,operation_id,created_by,balance_before,balance_after,payment_method)
    values(v_company,p_customer_id,p_store_id,p_entry_type,p_amount,p_sale_id,nullif(trim(p_note),''),p_operation_id,auth.uid(),v_before,v_after,
      case when p_entry_type='payment' then p_payment_method else null end) returning id into v_entry;
  if p_entry_type='payment' then
    insert into public.cash_transactions(company_id,store_id,transaction_type,designation,amount,source,payment_method,operation_id,created_by)
      values(v_company,p_store_id,'deposit','Paiement client '||v_customer,p_amount,'customer_payment',p_payment_method,p_operation_id,auth.uid());
  end if;
  if p_entry_type in ('payment','discount') then
    perform set_config('stockmaster.debt_settlement','1',true);
    v_remaining:=p_amount;
    for v_sale in select id,amount_due from public.sales where company_id=v_company and customer_id=p_customer_id and amount_due>0
      order by created_at,id for update loop
      exit when v_remaining<=0;v_allocate:=least(v_remaining,v_sale.amount_due);
      insert into public.customer_payment_allocations(company_id,ledger_entry_id,sale_id,amount) values(v_company,v_entry,v_sale.id,v_allocate);
      update public.sales set amount_due=amount_due-v_allocate,amount_paid=amount_paid+case when p_entry_type='payment' then v_allocate else 0 end,
        payment_status=case when amount_due-v_allocate=0 then 'paid' else 'partial' end where id=v_sale.id;
      v_remaining:=v_remaining-v_allocate;
    end loop;
  end if;
  insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by)
    values(v_company,auth.uid(),case p_entry_type when 'payment' then 'customer_debt_payment' when 'discount' then 'customer_debt_discount' else 'customer_debt_add' end,
      'customer_ledger',v_entry,jsonb_build_object('customer_id',p_customer_id,'amount',p_amount,'balance_before',v_before,'balance_after',v_after,
      'payment_method',p_payment_method,'reason',p_note),auth.uid());
  return v_entry;
end $$;

grant execute on function public.record_customer_entry_v2(uuid,uuid,text,numeric,text,text,uuid,uuid) to authenticated;
revoke all on function public.record_customer_entry_v2(uuid,uuid,text,numeric,text,text,uuid,uuid) from anon;
