-- Versioned customer debt schedules with automatic FIFO settlement.

create table public.customer_debt_schedules(
  id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,total numeric(12,2) not null check(total>0),
  status text not null default 'active' check(status in ('active','completed','superseded')),
  created_by uuid not null references public.profiles(id),created_at timestamptz not null default now()
);
create unique index customer_debt_one_active_schedule on public.customer_debt_schedules(customer_id) where status='active';
create table public.customer_debt_installments(
  id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id) on delete cascade,
  schedule_id uuid not null references public.customer_debt_schedules(id) on delete restrict,due_date date not null,
  amount numeric(12,2) not null check(amount>0),paid_amount numeric(12,2) not null default 0 check(paid_amount>=0 and paid_amount<=amount),
  status text not null default 'pending' check(status in ('pending','partial','paid')),created_at timestamptz not null default now()
);
alter table public.customer_debt_schedules enable row level security;alter table public.customer_debt_installments enable row level security;
create policy customer_debt_schedules_read on public.customer_debt_schedules for select to authenticated using(public.belongs_to_company(company_id));
create policy customer_debt_installments_read on public.customer_debt_installments for select to authenticated using(public.belongs_to_company(company_id));
grant select on public.customer_debt_schedules,public.customer_debt_installments to authenticated;
revoke insert,update,delete on public.customer_debt_schedules,public.customer_debt_installments from anon,authenticated;

create or replace function public.set_customer_debt_schedule(p_customer_id uuid,p_items jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_company uuid;v_balance numeric;v_total numeric:=0;v_schedule uuid;v_item jsonb;v_amount numeric;v_date date;
begin
  select company_id into v_company from public.customers where id=p_customer_id and is_active;
  if v_company is null or not public.is_company_admin(v_company) or not public.has_active_subscription(v_company) then raise exception 'Échéancier réservé à l’administrateur';end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>24 then raise exception 'Ajoutez entre 1 et 24 échéances';end if;
  perform pg_advisory_xact_lock(hashtextextended(p_customer_id::text,0));
  select coalesce(balance,0) into v_balance from public.customer_balances where customer_id=p_customer_id;
  if v_balance<=0 then raise exception 'Ce client n’a aucune dette à planifier';end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    begin v_amount=(v_item->>'amount')::numeric;v_date=(v_item->>'dueDate')::date;exception when others then raise exception 'Échéance invalide';end;
    if v_amount<=0 or v_date<current_date then raise exception 'Montant positif et date future requis';end if;v_total:=v_total+v_amount;
  end loop;
  if abs(v_total-v_balance)>0.01 then raise exception 'Le total des échéances (%) doit être égal à la dette actuelle (%)',v_total,v_balance;end if;
  update public.customer_debt_schedules set status='superseded' where customer_id=p_customer_id and status='active';
  insert into public.customer_debt_schedules(company_id,customer_id,total,created_by) values(v_company,p_customer_id,v_total,auth.uid()) returning id into v_schedule;
  for v_item in select value from jsonb_array_elements(p_items) loop
    insert into public.customer_debt_installments(company_id,schedule_id,due_date,amount)
      values(v_company,v_schedule,(v_item->>'dueDate')::date,(v_item->>'amount')::numeric);
  end loop;
  insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by)
    values(v_company,auth.uid(),'set_customer_debt_schedule','customer_debt_schedules',v_schedule,jsonb_build_object('customer_id',p_customer_id,'total',v_total,'items',p_items),auth.uid());
  return v_schedule;
end $$;

create or replace function public.allocate_customer_installments()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_remaining numeric;v_item record;v_allocate numeric;v_schedule uuid;
begin
  if new.entry_type not in ('payment','discount') then return new;end if;v_remaining:=new.amount;
  select id into v_schedule from public.customer_debt_schedules where customer_id=new.customer_id and status='active' for update;
  if v_schedule is null then return new;end if;
  for v_item in select id,amount,paid_amount from public.customer_debt_installments where schedule_id=v_schedule and status<>'paid' order by due_date,id for update loop
    exit when v_remaining<=0;v_allocate:=least(v_remaining,v_item.amount-v_item.paid_amount);
    update public.customer_debt_installments set paid_amount=paid_amount+v_allocate,
      status=case when paid_amount+v_allocate>=amount then 'paid' else 'partial' end where id=v_item.id;
    v_remaining:=v_remaining-v_allocate;
  end loop;
  if not exists(select 1 from public.customer_debt_installments where schedule_id=v_schedule and status<>'paid') then
    update public.customer_debt_schedules set status='completed' where id=v_schedule;
  end if;return new;
end $$;
create trigger allocate_customer_installments after insert on public.customer_ledger for each row execute function public.allocate_customer_installments();

grant execute on function public.set_customer_debt_schedule(uuid,jsonb) to authenticated;
revoke all on function public.set_customer_debt_schedule(uuid,jsonb) from anon;
