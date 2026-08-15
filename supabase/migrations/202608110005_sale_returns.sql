create table public.sale_returns (
  id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,sale_id uuid not null references public.sales(id) on delete restrict,
  refund_method text not null check(refund_method in ('cash','mobile_money','card','bank_transfer','credit_note')),
  total numeric(12,2) not null check(total>0),note text,operation_id uuid not null,created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),unique(company_id,operation_id)
);
create table public.sale_return_items (
  id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id) on delete cascade,
  return_id uuid not null references public.sale_returns(id) on delete cascade,sale_item_id uuid not null references public.sale_items(id) on delete restrict,
  product_id uuid not null references public.products(id),product_variant_id uuid references public.product_variants(id),quantity numeric(14,3) not null check(quantity>0),refund_amount numeric(12,2) not null check(refund_amount>=0),created_at timestamptz not null default now(),unique(return_id,sale_item_id)
);
create table public.customer_credit_notes (
  id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,return_id uuid not null unique references public.sale_returns(id) on delete cascade,
  amount numeric(12,2) not null check(amount>0),remaining_amount numeric(12,2) not null check(remaining_amount>=0),created_by uuid not null references public.profiles(id),created_at timestamptz not null default now()
);
create index sale_returns_sale_idx on public.sale_returns(sale_id,created_at desc);
alter table public.sale_returns enable row level security;alter table public.sale_return_items enable row level security;
alter table public.customer_credit_notes enable row level security;
create policy sale_returns_read on public.sale_returns for select to authenticated using(public.belongs_to_company(company_id) and public.can_access_store(company_id,store_id) and public.has_permission(company_id,'sales.read'));
create policy sale_return_items_read on public.sale_return_items for select to authenticated using(public.belongs_to_company(company_id) and public.has_permission(company_id,'sales.read'));
create policy customer_credit_notes_read on public.customer_credit_notes for select to authenticated using(public.belongs_to_company(company_id) and public.has_permission(company_id,'sales.read'));
grant select on public.sale_returns,public.sale_return_items,public.customer_credit_notes to authenticated;revoke insert,update,delete on public.sale_returns,public.sale_return_items,public.customer_credit_notes from anon,authenticated;

create or replace function public.record_sale_return(p_sale_id uuid,p_items jsonb,p_refund_method text,p_note text default null,p_operation_id uuid default gen_random_uuid())
returns uuid language plpgsql security definer set search_path=public as $$
declare v_company uuid;v_store uuid;v_return uuid;v_item jsonb;v_sale_item record;v_qty numeric;v_already numeric;v_refund numeric;v_total numeric:=0;v_customer uuid;
begin
  if p_refund_method not in ('cash','mobile_money','card','bank_transfer','credit_note') then raise exception 'Mode de remboursement invalide';end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Sélectionnez au moins un article';end if;
  select company_id,store_id,customer_id into v_company,v_store,v_customer from sales where id=p_sale_id;
  if v_company is null or not public.can_access_store(v_company,v_store) or not public.has_active_subscription(v_company) or not (public.is_company_admin(v_company) or public.has_permission(v_company,'sales.write')) then raise exception 'Retour de vente refusé';end if;
  perform public.lock_operation(p_operation_id);select id into v_return from sale_returns where company_id=v_company and operation_id=p_operation_id;if v_return is not null then return v_return;end if;
  v_return:=gen_random_uuid();insert into sale_returns(id,company_id,store_id,sale_id,refund_method,total,note,operation_id,created_by) values(v_return,v_company,v_store,p_sale_id,p_refund_method,1,nullif(trim(p_note),''),p_operation_id,auth.uid());
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty:=(v_item->>'quantity')::numeric;
    select id,product_id,product_variant_id,quantity,line_total into v_sale_item from sale_items where id=(v_item->>'saleItemId')::uuid and sale_id=p_sale_id for update;
    if v_sale_item.id is null or v_qty<=0 then raise exception 'Article retourné invalide';end if;
    select coalesce(sum(quantity),0) into v_already from sale_return_items where sale_item_id=v_sale_item.id;
    if v_qty+v_already>v_sale_item.quantity then raise exception 'La quantité retournée dépasse la quantité vendue';end if;
    v_refund:=round((v_sale_item.line_total/v_sale_item.quantity)*v_qty,2);v_total:=v_total+v_refund;
    insert into sale_return_items(company_id,return_id,sale_item_id,product_id,product_variant_id,quantity,refund_amount) values(v_company,v_return,v_sale_item.id,v_sale_item.product_id,v_sale_item.product_variant_id,v_qty,v_refund);
    update stock_levels set quantity=quantity+v_qty,updated_at=now() where company_id=v_company and store_id=v_store and product_id=v_sale_item.product_id and product_variant_id is not distinct from v_sale_item.product_variant_id;
    insert into stock_movements(company_id,store_id,product_id,product_variant_id,quantity,movement_type,operation_id,note,created_by) values(v_company,v_store,v_sale_item.product_id,v_sale_item.product_variant_id,v_qty,'return',gen_random_uuid(),'Retour vente '||p_sale_id,auth.uid());
  end loop;
  update sale_returns set total=v_total where id=v_return;
  if p_refund_method<>'credit_note' then insert into cash_transactions(company_id,store_id,transaction_type,designation,amount,source,payment_method,operation_id,created_by) values(v_company,v_store,'withdrawal','Remboursement vente',v_total,'sale_return',p_refund_method,p_operation_id,auth.uid());
  elsif v_customer is null then raise exception 'Un avoir nécessite un client associé à la vente';
  else insert into customer_credit_notes(company_id,customer_id,return_id,amount,remaining_amount,created_by) values(v_company,v_customer,v_return,v_total,v_total,auth.uid());end if;
  insert into audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by) values(v_company,auth.uid(),'refund_sale','sale_returns',v_return,jsonb_build_object('sale_id',p_sale_id,'amount',v_total,'method',p_refund_method),auth.uid());
  return v_return;
end $$;
grant execute on function public.record_sale_return(uuid,jsonb,text,text,uuid) to authenticated;revoke all on function public.record_sale_return(uuid,jsonb,text,text,uuid) from anon;
