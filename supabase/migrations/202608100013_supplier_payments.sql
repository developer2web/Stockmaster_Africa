-- Supplier accounts: partial payments, FIFO allocation and cash traceability.

alter table public.purchases
  add column if not exists amount_paid numeric(12,2) not null default 0 check (amount_paid >= 0),
  add column if not exists amount_due numeric(12,2) not null default 0 check (amount_due >= 0);

update public.purchases
set amount_paid = case when payment_status = 'paid' then total else 0 end,
    amount_due = case when payment_status = 'paid' then 0 else total end;

alter table public.purchases drop constraint if exists purchases_payment_status_check;
alter table public.purchases
  add constraint purchases_payment_status_check
  check (payment_status in ('paid','partial','due'));

create table public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('cash','mobile_money','card','bank_transfer')),
  note text,
  operation_id uuid not null,
  cash_transaction_id uuid references public.cash_transactions(id) on delete restrict,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, operation_id)
);

create table public.supplier_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  supplier_payment_id uuid not null references public.supplier_payments(id) on delete cascade,
  purchase_id uuid not null references public.purchases(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique(supplier_payment_id, purchase_id)
);

create index supplier_payments_supplier_created_idx
  on public.supplier_payments(supplier_id, created_at desc);
create index supplier_payment_allocations_purchase_idx
  on public.supplier_payment_allocations(purchase_id);

create trigger touch_updated_at before update on public.supplier_payments
for each row execute function public.touch_updated_at();
create trigger audit_supplier_payments after insert or update or delete on public.supplier_payments
for each row execute function public.write_audit_log();

alter table public.supplier_payments enable row level security;
alter table public.supplier_payment_allocations enable row level security;

create policy supplier_payments_select on public.supplier_payments for select to authenticated
using (
  public.belongs_to_company(company_id)
  and public.can_access_store(company_id, store_id)
  and (public.has_permission(company_id,'purchases.read') or public.has_permission(company_id,'suppliers.read'))
);
create policy supplier_payment_allocations_select on public.supplier_payment_allocations for select to authenticated
using (
  public.belongs_to_company(company_id)
  and exists (
    select 1 from public.supplier_payments sp
    where sp.id = supplier_payment_id
      and public.can_access_store(sp.company_id, sp.store_id)
  )
  and (public.has_permission(company_id,'purchases.read') or public.has_permission(company_id,'suppliers.read'))
);

revoke insert,update,delete on public.supplier_payments from anon,authenticated;
revoke insert,update,delete on public.supplier_payment_allocations from anon,authenticated;
grant select on public.supplier_payments, public.supplier_payment_allocations to authenticated;

create or replace function public.record_supplier_payment(
  p_store_id uuid,
  p_supplier_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_note text default null,
  p_operation_id uuid default gen_random_uuid()
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_company uuid;
  v_payment uuid;
  v_cash uuid;
  v_total_due numeric;
  v_remaining numeric;
  v_allocate numeric;
  v_purchase record;
  v_supplier_name text;
begin
  if p_operation_id is null then raise exception 'Identifiant d''opération requis'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Le montant doit être supérieur à zéro'; end if;
  if p_payment_method not in ('cash','mobile_money','card','bank_transfer') then
    raise exception 'Moyen de paiement invalide';
  end if;

  select s.company_id, s.name into v_company, v_supplier_name
  from public.suppliers s
  where s.id=p_supplier_id and s.store_id=p_store_id and s.is_active;

  if v_company is null
    or not public.belongs_to_company(v_company)
    or not public.can_access_store(v_company,p_store_id)
    or not public.has_active_subscription(v_company)
    or not (
      public.is_business_owner(v_company)
      or public.has_permission(v_company,'purchases.read')
      or public.has_permission(v_company,'suppliers.write')
    )
    or not (
      public.is_business_owner(v_company)
      or public.has_permission(v_company,'cash_transactions.write')
      or public.has_permission(v_company,'expenses.write')
    ) then
    raise exception 'Accès au règlement fournisseur refusé';
  end if;

  perform public.lock_operation(p_operation_id);
  select id into v_payment from public.supplier_payments
  where company_id=v_company and operation_id=p_operation_id;
  if v_payment is not null then return v_payment; end if;

  select coalesce(sum(amount_due),0) into v_total_due
  from public.purchases
  where company_id=v_company and store_id=p_store_id
    and supplier_id=p_supplier_id and amount_due>0;

  if v_total_due <= 0 then raise exception 'Ce fournisseur n''a aucune dette à régler'; end if;
  if p_amount > v_total_due then
    raise exception 'Le paiement dépasse la dette fournisseur restante (%)', v_total_due;
  end if;

  insert into public.cash_transactions(
    company_id,store_id,transaction_type,designation,amount,source,
    payment_method,operation_id,created_by
  ) values (
    v_company,p_store_id,'withdrawal','Paiement fournisseur '||v_supplier_name,
    p_amount,'supplier_payment',p_payment_method,p_operation_id,auth.uid()
  ) returning id into v_cash;

  insert into public.supplier_payments(
    company_id,store_id,supplier_id,amount,payment_method,note,
    operation_id,cash_transaction_id,created_by
  ) values (
    v_company,p_store_id,p_supplier_id,p_amount,p_payment_method,
    nullif(trim(p_note),''),p_operation_id,v_cash,auth.uid()
  ) returning id into v_payment;

  v_remaining := p_amount;
  for v_purchase in
    select id,amount_due from public.purchases
    where company_id=v_company and store_id=p_store_id
      and supplier_id=p_supplier_id and amount_due>0
    order by created_at,id
    for update
  loop
    exit when v_remaining <= 0;
    v_allocate := least(v_remaining,v_purchase.amount_due);
    insert into public.supplier_payment_allocations(
      company_id,supplier_payment_id,purchase_id,amount
    ) values (v_company,v_payment,v_purchase.id,v_allocate);
    update public.purchases
    set amount_paid=amount_paid+v_allocate,
        amount_due=amount_due-v_allocate,
        payment_status=case
          when amount_due-v_allocate=0 then 'paid'
          else 'partial'
        end
    where id=v_purchase.id;
    v_remaining := v_remaining-v_allocate;
  end loop;
  return v_payment;
end
$$;

grant execute on function public.record_supplier_payment(uuid,uuid,numeric,text,text,uuid) to authenticated;
revoke all on function public.record_supplier_payment(uuid,uuid,numeric,text,text,uuid) from anon;

create or replace function public.record_purchase(
  p_store_id uuid, p_supplier_id uuid, p_items jsonb,
  p_paid boolean default true, p_operation_id uuid default gen_random_uuid()
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_company uuid;v_purchase uuid;v_item jsonb;v_product uuid;v_quantity numeric;v_cost numeric;v_total numeric:=0;
begin
  select company_id into v_company from stores where id=p_store_id and is_active and public.can_access_store(company_id,id);
  if v_company is null or not public.has_active_subscription(v_company) or not (public.has_permission(v_company,'stock_movements.write') or public.has_permission(v_company,'suppliers.write')) then raise exception 'Accès approvisionnement refusé';end if;
  if not exists(select 1 from suppliers where id=p_supplier_id and company_id=v_company and store_id=p_store_id and is_active) then raise exception 'Fournisseur invalide';end if;
  perform public.lock_operation(p_operation_id);
  select id into v_purchase from purchases where operation_id=p_operation_id;
  if v_purchase is not null then return v_purchase;end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Ajoutez au moins un produit';end if;
  v_purchase:=gen_random_uuid();
  insert into purchases(id,company_id,supplier_id,store_id,total,amount_paid,amount_due,operation_id,payment_status,created_by) values(v_purchase,v_company,p_supplier_id,p_store_id,0,0,0,p_operation_id,case when p_paid then 'paid' else 'due' end,auth.uid());
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_product:=(v_item->>'productId')::uuid;v_quantity:=(v_item->>'quantity')::numeric;v_cost:=(v_item->>'unitCost')::numeric;
    if v_quantity<=0 or v_cost<0 or not exists(select 1 from products where id=v_product and company_id=v_company and store_id=p_store_id and is_active) then raise exception 'Ligne approvisionnement invalide';end if;
    insert into purchase_items(company_id,purchase_id,product_id,quantity,unit_cost,created_by) values(v_company,v_purchase,v_product,v_quantity,v_cost,auth.uid());
    insert into stock_levels(company_id,store_id,product_id,product_variant_id,quantity,created_by) values(v_company,p_store_id,v_product,null,v_quantity,auth.uid()) on conflict(company_id,store_id,product_id,product_variant_id) do update set quantity=stock_levels.quantity+excluded.quantity,updated_at=now();
    insert into stock_movements(company_id,store_id,product_id,quantity,movement_type,operation_id,note,created_by) values(v_company,p_store_id,v_product,v_quantity,'purchase',gen_random_uuid(),'Approvisionnement '||v_purchase,auth.uid());
    update products set purchase_price=v_cost where id=v_product;
    v_total:=v_total+v_quantity*v_cost;
  end loop;
  update purchases set total=v_total,amount_paid=case when p_paid then v_total else 0 end,amount_due=case when p_paid then 0 else v_total end where id=v_purchase;
  if p_paid and v_total>0 then insert into cash_transactions(company_id,store_id,transaction_type,designation,amount,source,operation_id,created_by) values(v_company,p_store_id,'withdrawal','Approvisionnement fournisseur',v_total,'purchase',p_operation_id,auth.uid());end if;
  return v_purchase;
end $$;

grant execute on function public.record_purchase(uuid,uuid,jsonb,boolean,uuid) to authenticated;
revoke all on function public.record_purchase(uuid,uuid,jsonb,boolean,uuid) from anon;

