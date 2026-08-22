-- Operational business rules: sales, credit, stock, refunds and cash controls.

alter table public.companies
  add column if not exists allow_negative_stock boolean not null default false,
  add column if not exists max_discount_percent numeric(5,2) not null default 100 check(max_discount_percent between 0 and 100),
  add column if not exists require_refund_reason boolean not null default true,
  add column if not exists cash_opening_required boolean not null default false,
  add column if not exists cash_variance_reason_threshold numeric(14,2) not null default 0 check(cash_variance_reason_threshold >= 0);

alter table public.customers
  add column if not exists credit_limit numeric(14,2) check(credit_limit is null or credit_limit >= 0);

alter table public.sales
  add column if not exists tax_rate_snapshot numeric(7,4) not null default 0 check(tax_rate_snapshot between 0 and 100),
  add column if not exists tax_total numeric(12,2) not null default 0 check(tax_total >= 0);

alter table public.sale_items
  add column if not exists tax_rate_snapshot numeric(7,4) not null default 0 check(tax_rate_snapshot between 0 and 100),
  add column if not exists tax_amount numeric(12,2) not null default 0 check(tax_amount >= 0);

alter table public.sale_return_items
  add column if not exists disposition text not null default 'restock'
    check(disposition in ('restock','damaged','lost'));

alter table public.sale_returns
  add column if not exists debt_reduction numeric(12,2) not null default 0 check(debt_reduction >= 0),
  add column if not exists refunded_amount numeric(12,2) not null default 0 check(refunded_amount >= 0);

insert into public.permissions(code,description) values
  ('sales.discount_override','Dépasser la limite normale de remise'),
  ('cash.reopen','Valider la reprise d’une caisse clôturée')
on conflict(code) do update set description=excluded.description;

create or replace function public.create_sale(
  p_store_id uuid,
  p_payment_method text,
  p_items jsonb,
  p_customer_id uuid default null,
  p_operation_id uuid default gen_random_uuid()
) returns table(sale_id uuid, reference text, total numeric, gross_profit numeric)
language plpgsql security definer set search_path=public as $$
declare
  v_company uuid;v_sale uuid;v_reference text;v_item jsonb;v_product uuid;v_variant uuid;
  v_quantity numeric;v_discount numeric;v_purchase numeric;v_price numeric;v_available numeric;v_new_stock numeric;
  v_subtotal numeric:=0;v_discounts numeric:=0;v_cost numeric:=0;v_profit numeric:=0;v_tax numeric:=0;v_line_net numeric;v_line_tax numeric;
  v_tax_rate numeric:=0;v_allow_negative boolean:=false;v_max_discount numeric:=100;v_allow_discounts boolean:=false;
begin
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>100 then
    raise exception 'Le panier doit contenir entre 1 et 100 articles';
  end if;
  if p_payment_method not in ('cash','mobile_money','credit','partial') then raise exception 'Moyen de paiement invalide';end if;

  select s.company_id,c.tax_rate,c.allow_negative_stock,c.max_discount_percent,c.allow_discounts
    into v_company,v_tax_rate,v_allow_negative,v_max_discount,v_allow_discounts
  from public.stores s join public.companies c on c.id=s.company_id
  where s.id=p_store_id and s.is_active and c.is_active;
  if v_company is null or not public.can_access_store(v_company,p_store_id)
     or not public.has_active_subscription(v_company) or not public.has_permission(v_company,'sales.write') then
    raise exception 'Accès refusé, boutique invalide ou abonnement inactif';
  end if;
  if p_customer_id is not null and not exists(select 1 from public.customers where id=p_customer_id and company_id=v_company and is_active) then
    raise exception 'Client invalide ou inactif';
  end if;

  perform public.lock_operation(p_operation_id);
  select s.id,s.reference,s.total,s.gross_profit into sale_id,reference,total,gross_profit
    from public.sales s where s.operation_id=p_operation_id and s.company_id=v_company;
  if sale_id is not null then return next;return;end if;

  v_sale:=gen_random_uuid();
  v_reference:='SM-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(v_sale::text,'-',''),1,8));
  insert into public.sales(id,company_id,store_id,customer_id,total,payment_method,operation_id,reference,created_by,tax_rate_snapshot)
  values(v_sale,v_company,p_store_id,p_customer_id,0,p_payment_method,p_operation_id,v_reference,auth.uid(),coalesce(v_tax_rate,0));

  for v_item in select value from jsonb_array_elements(p_items) loop
    begin
      v_product=(v_item->>'productId')::uuid;v_variant=nullif(v_item->>'variantId','')::uuid;
      v_quantity=(v_item->>'quantity')::numeric;v_discount=coalesce((v_item->>'discount')::numeric,0);
    exception when others then raise exception 'Article de vente invalide';end;
    if v_quantity<=0 then raise exception 'La quantité vendue doit être positive';end if;
    select p.purchase_price,p.sale_price into v_purchase,v_price from public.products p
      where p.id=v_product and p.company_id=v_company and p.store_id=p_store_id and p.is_active;
    if not found or v_price<0 then raise exception 'Produit ou prix invalide';end if;
    if v_variant is not null then
      select coalesce(v.purchase_price,v_purchase),coalesce(v.sale_price,v_price) into v_purchase,v_price
      from public.product_variants v where v.id=v_variant and v.product_id=v_product and v.company_id=v_company and v.is_active;
      if not found or v_price<0 then raise exception 'Variante ou prix invalide';end if;
    end if;
    if v_discount<0 or v_discount>v_price*v_quantity then raise exception 'Remise invalide';end if;
    if v_discount>0 and not v_allow_discounts then raise exception 'Les remises sont désactivées par l’administrateur';end if;
    if v_discount>(v_price*v_quantity*coalesce(v_max_discount,100)/100)
       and not public.has_permission(v_company,'sales.discount_override') then
      raise exception 'La remise dépasse la limite autorisée de % pour cent',v_max_discount;
    end if;

    select sl.quantity into v_available from public.stock_levels sl where sl.company_id=v_company and sl.store_id=p_store_id
      and sl.product_id=v_product and sl.product_variant_id is not distinct from v_variant for update;
    v_available:=coalesce(v_available,0);v_new_stock:=v_available-v_quantity;
    if v_new_stock<0 and not v_allow_negative then raise exception 'Stock insuffisant (disponible: %)',v_available;end if;
    if not exists(select 1 from public.stock_levels sl where sl.company_id=v_company and sl.store_id=p_store_id
      and sl.product_id=v_product and sl.product_variant_id is not distinct from v_variant) then
      insert into public.stock_levels(company_id,store_id,product_id,product_variant_id,quantity)
      values(v_company,p_store_id,v_product,v_variant,v_new_stock);
    else
      update public.stock_levels set quantity=v_new_stock,updated_at=now() where company_id=v_company and store_id=p_store_id
        and product_id=v_product and product_variant_id is not distinct from v_variant;
    end if;
    insert into public.stock_movements(company_id,store_id,product_id,product_variant_id,quantity,movement_type,operation_id,note,created_by)
      values(v_company,p_store_id,v_product,v_variant,-v_quantity,'sale',gen_random_uuid(),'Vente '||v_reference,auth.uid());

    v_line_net:=(v_price*v_quantity)-v_discount;
    v_line_tax:=round(v_line_net*coalesce(v_tax_rate,0)/100,2);
    insert into public.sale_items(company_id,sale_id,product_id,product_variant_id,purchase_price_snapshot,sale_price,quantity,discount,created_by,tax_rate_snapshot,tax_amount)
      values(v_company,v_sale,v_product,v_variant,v_purchase,v_price,v_quantity,v_discount,auth.uid(),coalesce(v_tax_rate,0),v_line_tax);
    v_subtotal:=v_subtotal+(v_price*v_quantity);v_discounts:=v_discounts+v_discount;v_tax:=v_tax+v_line_tax;
    v_cost:=v_cost+(v_purchase*v_quantity);v_profit:=v_profit+((v_price-v_purchase)*v_quantity)-v_discount;

    if v_new_stock<0 then
      insert into public.notifications(company_id,user_id,title,body,type,created_by)
      values(v_company,null,'Stock négatif','La vente '||v_reference||' a placé un article à '||v_new_stock||' unité(s).','negative_stock',auth.uid());
    end if;
  end loop;
  update public.sales set subtotal=v_subtotal,discount_total=v_discounts,tax_total=v_tax,total=v_subtotal-v_discounts+v_tax,
    cost_total=v_cost,gross_profit=v_profit where id=v_sale;
  insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by)
  values(v_company,auth.uid(),'create_sale','sales',v_sale,jsonb_build_object('reference',v_reference,'store_id',p_store_id,
    'payment_method',p_payment_method,'subtotal',v_subtotal,'discount',v_discounts,'tax',v_tax,'total',v_subtotal-v_discounts+v_tax),auth.uid());
  sale_id:=v_sale;reference:=v_reference;total:=v_subtotal-v_discounts+v_tax;gross_profit:=v_profit;return next;
end $$;

create or replace function public.create_sale_v2(
  p_store_id uuid,p_payment_method text,p_items jsonb,p_customer_id uuid default null,
  p_amount_paid numeric default null,p_operation_id uuid default gen_random_uuid()
) returns table(sale_id uuid,reference text,total numeric,gross_profit numeric,amount_paid numeric,amount_due numeric,payment_status text)
language plpgsql security definer set search_path=public as $$
declare result record;paid numeric;due numeric;status text;v_company uuid;v_allow_credit boolean;v_limit numeric;v_balance numeric;
begin
  select * into result from public.create_sale(p_store_id,p_payment_method,p_items,p_customer_id,p_operation_id);
  if p_payment_method='credit' then paid:=0;
  elsif p_payment_method='partial' then paid:=least(result.total,greatest(0,coalesce(p_amount_paid,0)));
  else paid:=result.total;end if;
  due:=result.total-paid;
  select s.company_id,c.allow_credit_sales into v_company,v_allow_credit from public.stores s join public.companies c on c.id=s.company_id where s.id=p_store_id;
  if due>0 and not coalesce(v_allow_credit,false) then raise exception 'Les ventes à crédit sont désactivées';end if;
  if due>0 and p_customer_id is null then raise exception 'Un client est obligatoire pour une vente avec dette';end if;
  if due>0 then
    select c.credit_limit,coalesce(cb.balance,0) into v_limit,v_balance from public.customers c
      left join public.customer_balances cb on cb.customer_id=c.id where c.id=p_customer_id and c.company_id=v_company for update of c;
    if v_limit is not null and v_balance+due>v_limit then
      raise exception 'Limite de crédit dépassée (limite: %, dette après vente: %)',v_limit,v_balance+due;
    end if;
  end if;
  status:=case when due=0 then 'paid' when paid=0 then 'credit' else 'partial' end;
  update public.sales set amount_paid=paid,amount_due=due,payment_status=status where id=result.sale_id;
  if due>0 and not exists(select 1 from public.customer_ledger where sale_id=result.sale_id and entry_type='credit') then
    insert into public.customer_ledger(company_id,customer_id,store_id,entry_type,amount,sale_id,note,created_by)
    values(v_company,p_customer_id,p_store_id,'credit',due,result.sale_id,'Crédit vente '||result.reference,auth.uid());
  end if;
  sale_id:=result.sale_id;reference:=result.reference;total:=result.total;gross_profit:=result.gross_profit;
  amount_paid:=paid;amount_due:=due;payment_status:=status;return next;
end $$;

grant execute on function public.create_sale(uuid,text,jsonb,uuid,uuid) to authenticated;
grant execute on function public.create_sale_v2(uuid,text,jsonb,uuid,numeric,uuid) to authenticated;
revoke all on function public.create_sale(uuid,text,jsonb,uuid,uuid) from anon;
revoke all on function public.create_sale_v2(uuid,text,jsonb,uuid,numeric,uuid) from anon;

create or replace function public.close_store_cash(p_store_id uuid,p_counted_amount numeric,p_note text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_company uuid;v_expected numeric;v_id uuid;v_label text;v_latest uuid;v_opening public.cash_openings%rowtype;
  v_base numeric:=0;v_since timestamptz;v_threshold numeric:=0;v_difference numeric;
begin
  perform pg_advisory_xact_lock(hashtextextended('cash-close:'||p_store_id::text,0));
  select s.company_id,c.cash_variance_reason_threshold into v_company,v_threshold from public.stores s join public.companies c on c.id=s.company_id where s.id=p_store_id;
  if v_company is null or not public.can_access_store(v_company,p_store_id) or not (public.has_permission(v_company,'cash_transactions.write') or public.has_permission(v_company,'expenses.write')) then raise exception 'Accès refusé';end if;
  if p_counted_amount is null or p_counted_amount<0 then raise exception 'Le montant compté ne peut pas être négatif';end if;
  select id into v_latest from public.cash_closures where store_id=p_store_id order by created_at desc,id desc limit 1;
  if v_latest is not null and not exists(select 1 from public.cash_openings where last_closure_id=v_latest) then raise exception 'Validez d’abord le montant initial de cette reprise';end if;
  select co.* into v_opening from public.cash_openings co where co.store_id=p_store_id order by co.created_at desc,co.id desc limit 1;
  if v_opening.id is not null then v_base:=v_opening.counted_amount;v_since:=v_opening.created_at;end if;
  select v_base+coalesce(sum(case when transaction_type='deposit' then amount else -amount end),0) into v_expected
    from public.cash_transactions where company_id=v_company and store_id=p_store_id and (v_since is null or created_at>v_since);
  v_difference:=p_counted_amount-v_expected;
  if abs(v_difference)>coalesce(v_threshold,0) and length(trim(coalesce(p_note,'')))<3 then
    raise exception 'Une justification est obligatoire pour cet écart de caisse';
  end if;
  select case when r.code='company_admin' then 'Administrateur' else coalesce(nullif(trim(p.full_name),''),'Employé') end into v_label
    from public.memberships m join public.roles r on r.id=m.role_id join public.profiles p on p.id=m.user_id
    where m.user_id=auth.uid() and m.company_id=v_company and m.is_active order by case when r.code='company_admin' then 0 else 1 end limit 1;
  insert into public.cash_closures(company_id,store_id,expected_amount,counted_amount,note,closed_by,closed_by_label)
    values(v_company,p_store_id,v_expected,p_counted_amount,nullif(trim(p_note),''),auth.uid(),coalesce(v_label,'Employé')) returning id into v_id;
  insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by)
    values(v_company,auth.uid(),'close_cash','cash_closures',v_id,jsonb_build_object('expected',v_expected,'counted',p_counted_amount,
      'difference',v_difference,'closed_by',v_label,'opening_id',v_opening.id),auth.uid());
  return v_id;
end $$;

grant execute on function public.close_store_cash(uuid,numeric,text) to authenticated;
revoke all on function public.close_store_cash(uuid,numeric,text) from anon;

alter table public.cash_openings alter column last_closure_id drop not null;

create or replace function public.get_store_cash_session_status(p_store_id uuid)
returns table(requires_opening boolean,closure_id uuid,expected_initial numeric,closed_at timestamptz,closed_by_label text)
language plpgsql stable security definer set search_path=public as $$
declare v_company uuid;v_required boolean;v_closure public.cash_closures%rowtype;
begin
  select s.company_id,c.cash_opening_required into v_company,v_required from public.stores s join public.companies c on c.id=s.company_id where s.id=p_store_id;
  if v_company is null or not public.can_access_store(v_company,p_store_id) then raise exception 'Accès refusé';end if;
  select * into v_closure from public.cash_closures where store_id=p_store_id order by created_at desc,id desc limit 1;
  if v_closure.id is not null then
    return query select not exists(select 1 from public.cash_openings where last_closure_id=v_closure.id),v_closure.id,
      v_closure.counted_amount,v_closure.created_at,v_closure.closed_by_label;
  else
    return query select coalesce(v_required,false) and not exists(select 1 from public.cash_openings where store_id=p_store_id),
      null::uuid,0::numeric,null::timestamptz,null::text;
  end if;
end $$;

create or replace function public.open_store_cash(p_store_id uuid,p_counted_amount numeric,p_note text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_company uuid;v_closure public.cash_closures%rowtype;v_id uuid;v_label text;v_expected numeric:=0;
begin
  perform pg_advisory_xact_lock(hashtextextended('cash-open:'||p_store_id::text,0));
  select company_id into v_company from public.stores where id=p_store_id and is_active;
  if v_company is null or not public.can_access_store(v_company,p_store_id)
     or not (public.has_permission(v_company,'cash_transactions.write') or public.has_permission(v_company,'expenses.write')) then raise exception 'Accès refusé';end if;
  if p_counted_amount is null or p_counted_amount<0 then raise exception 'Le montant initial est invalide';end if;
  select * into v_closure from public.cash_closures where store_id=p_store_id order by created_at desc,id desc limit 1 for update;
  if v_closure.id is null then
    if exists(select 1 from public.cash_openings where store_id=p_store_id) then raise exception 'La caisse est déjà ouverte';end if;
  else
    if exists(select 1 from public.cash_openings where last_closure_id=v_closure.id) then raise exception 'Cette reprise de caisse a déjà été validée';end if;
    if not (public.is_company_admin(v_company) or public.has_permission(v_company,'cash.reopen')) then raise exception 'La permission de réouverture de caisse est requise';end if;
    v_expected:=v_closure.counted_amount;
  end if;
  select case when r.code='company_admin' then 'Administrateur' else coalesce(nullif(trim(p.full_name),''),'Employé') end into v_label
  from public.memberships m join public.roles r on r.id=m.role_id join public.profiles p on p.id=m.user_id
  where m.user_id=auth.uid() and m.company_id=v_company and m.is_active order by case when r.code='company_admin' then 0 else 1 end limit 1;
  insert into public.cash_openings(company_id,store_id,last_closure_id,expected_amount,counted_amount,note,opened_by,opened_by_label)
    values(v_company,p_store_id,v_closure.id,v_expected,p_counted_amount,nullif(trim(p_note),''),auth.uid(),coalesce(v_label,'Employé')) returning id into v_id;
  insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by)
    values(v_company,auth.uid(),case when v_closure.id is null then 'open_cash' else 'reopen_cash' end,'cash_openings',v_id,
      jsonb_build_object('closure_id',v_closure.id,'expected',v_expected,'counted',p_counted_amount,'difference',p_counted_amount-v_expected),auth.uid());
  return v_id;
end $$;

create or replace function public.require_open_cash_session()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_closure uuid;v_required boolean;
begin
  select cash_opening_required into v_required from public.companies where id=new.company_id;
  select id into v_closure from public.cash_closures where store_id=new.store_id order by created_at desc,id desc limit 1;
  if v_closure is not null and not exists(select 1 from public.cash_openings where last_closure_id=v_closure) then
    raise exception 'La caisse est clôturée. Validez sa réouverture avant toute opération';
  end if;
  if v_closure is null and coalesce(v_required,false) and not exists(select 1 from public.cash_openings where store_id=new.store_id) then
    raise exception 'Ouvrez la caisse avant toute opération';
  end if;
  return new;
end $$;

drop trigger if exists require_open_cash_session on public.cash_transactions;
create trigger require_open_cash_session before insert on public.cash_transactions for each row execute function public.require_open_cash_session();
drop trigger if exists require_open_cash_for_sale on public.sales;
create trigger require_open_cash_for_sale before insert on public.sales for each row execute function public.require_open_cash_session();

grant execute on function public.get_store_cash_session_status(uuid) to authenticated;
grant execute on function public.open_store_cash(uuid,numeric,text) to authenticated;
revoke all on function public.get_store_cash_session_status(uuid) from anon;
revoke all on function public.open_store_cash(uuid,numeric,text) from anon;

create or replace function public.record_sale_return(
  p_sale_id uuid,p_items jsonb,p_refund_method text,p_note text default null,p_operation_id uuid default gen_random_uuid()
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_sale public.sales%rowtype;v_return uuid;v_item jsonb;v_sale_item record;v_qty numeric;v_already numeric;
  v_refund numeric;v_total numeric:=0;v_disposition text;v_reason_required boolean;v_debt_reduction numeric:=0;
  v_refundable_paid numeric:=0;v_refunded numeric:=0;v_cash_refund numeric:=0;
begin
  if p_refund_method not in ('cash','mobile_money','credit_note') then raise exception 'Mode de remboursement invalide';end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Sélectionnez au moins un article';end if;
  select * into v_sale from public.sales where id=p_sale_id for update;
  if v_sale.id is null or not public.can_access_store(v_sale.company_id,v_sale.store_id) or not public.has_active_subscription(v_sale.company_id)
     or not (public.is_company_admin(v_sale.company_id) or public.has_permission(v_sale.company_id,'sales.refund')) then
    raise exception 'Retour de vente refusé';
  end if;
  select require_refund_reason into v_reason_required from public.companies where id=v_sale.company_id;
  if v_reason_required and length(trim(coalesce(p_note,'')))<3 then raise exception 'La raison du remboursement est obligatoire';end if;
  perform public.lock_operation(p_operation_id);
  select id into v_return from public.sale_returns where company_id=v_sale.company_id and operation_id=p_operation_id;
  if v_return is not null then return v_return;end if;

  v_return:=gen_random_uuid();
  insert into public.sale_returns(id,company_id,store_id,sale_id,refund_method,total,note,operation_id,created_by)
    values(v_return,v_sale.company_id,v_sale.store_id,p_sale_id,p_refund_method,1,nullif(trim(p_note),''),p_operation_id,auth.uid());
  for v_item in select value from jsonb_array_elements(p_items) loop
    begin
      v_qty=(v_item->>'quantity')::numeric;
      v_disposition=coalesce(nullif(v_item->>'disposition',''),'restock');
    exception when others then raise exception 'Article retourné invalide';end;
    if v_disposition not in ('restock','damaged','lost') then raise exception 'État de retour invalide';end if;
    select id,product_id,product_variant_id,quantity,line_total,tax_amount into v_sale_item from public.sale_items
      where id=(v_item->>'saleItemId')::uuid and sale_id=p_sale_id for update;
    if v_sale_item.id is null or v_qty<=0 then raise exception 'Article retourné invalide';end if;
    select coalesce(sum(quantity),0) into v_already from public.sale_return_items where sale_item_id=v_sale_item.id;
    if v_qty+v_already>v_sale_item.quantity then raise exception 'La quantité retournée dépasse la quantité vendue';end if;
    v_refund:=round(((v_sale_item.line_total+v_sale_item.tax_amount)/v_sale_item.quantity)*v_qty,2);
    v_total:=v_total+v_refund;
    insert into public.sale_return_items(company_id,return_id,sale_item_id,product_id,product_variant_id,quantity,refund_amount,disposition)
      values(v_sale.company_id,v_return,v_sale_item.id,v_sale_item.product_id,v_sale_item.product_variant_id,v_qty,v_refund,v_disposition);
    if v_disposition='restock' then
      update public.stock_levels set quantity=quantity+v_qty,updated_at=now() where company_id=v_sale.company_id and store_id=v_sale.store_id
        and product_id=v_sale_item.product_id and product_variant_id is not distinct from v_sale_item.product_variant_id;
      if not found then
        insert into public.stock_levels(company_id,store_id,product_id,product_variant_id,quantity)
          values(v_sale.company_id,v_sale.store_id,v_sale_item.product_id,v_sale_item.product_variant_id,v_qty);
      end if;
      insert into public.stock_movements(company_id,store_id,product_id,product_variant_id,quantity,movement_type,operation_id,note,created_by)
        values(v_sale.company_id,v_sale.store_id,v_sale_item.product_id,v_sale_item.product_variant_id,v_qty,'return',gen_random_uuid(),'Retour vente '||p_sale_id,auth.uid());
    end if;
  end loop;

  v_debt_reduction:=least(v_total,v_sale.amount_due);
  if v_debt_reduction>0 then
    if v_sale.customer_id is null then raise exception 'La dette de la vente n’est liée à aucun client';end if;
    insert into public.customer_ledger(company_id,customer_id,store_id,entry_type,amount,sale_id,note,operation_id,created_by)
      values(v_sale.company_id,v_sale.customer_id,v_sale.store_id,'payment',v_debt_reduction,p_sale_id,
        'Réduction de dette par retour '||v_sale.reference,gen_random_uuid(),auth.uid());
    update public.sales set amount_due=amount_due-v_debt_reduction,
      payment_status=case when amount_due-v_debt_reduction=0 then 'paid' else 'partial' end where id=p_sale_id;
  end if;
  select coalesce(sum(refunded_amount),0) into v_refunded from public.sale_returns where sale_id=p_sale_id and id<>v_return;
  v_refundable_paid:=greatest(0,v_sale.amount_paid-v_refunded);
  v_cash_refund:=v_total-v_debt_reduction;
  if v_cash_refund>v_refundable_paid then raise exception 'Le remboursement dépasse le montant réellement payé';end if;

  update public.sale_returns set total=v_total,debt_reduction=v_debt_reduction,refunded_amount=v_cash_refund where id=v_return;
  if v_cash_refund>0 and p_refund_method<>'credit_note' then
    insert into public.cash_transactions(company_id,store_id,transaction_type,designation,amount,source,payment_method,operation_id,created_by)
      values(v_sale.company_id,v_sale.store_id,'withdrawal','Remboursement vente '||v_sale.reference,v_cash_refund,
        'sale_return',p_refund_method,p_operation_id,auth.uid());
  elsif v_cash_refund>0 then
    if v_sale.customer_id is null then raise exception 'Un avoir nécessite un client associé à la vente';end if;
    insert into public.customer_credit_notes(company_id,customer_id,return_id,amount,remaining_amount,created_by)
      values(v_sale.company_id,v_sale.customer_id,v_return,v_cash_refund,v_cash_refund,auth.uid());
  end if;
  insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by)
    values(v_sale.company_id,auth.uid(),'refund_sale','sale_returns',v_return,jsonb_build_object('sale_id',p_sale_id,
      'amount',v_total,'debt_reduction',v_debt_reduction,'refunded_amount',v_cash_refund,'method',p_refund_method,'reason',p_note),auth.uid());
  return v_return;
end $$;

grant execute on function public.record_sale_return(uuid,jsonb,text,text,uuid) to authenticated;
revoke all on function public.record_sale_return(uuid,jsonb,text,text,uuid) from anon;

create or replace function public.get_sale_detail_safe(p_sale_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'id',s.id,'company_id',s.company_id,'store_id',s.store_id,'customer_id',s.customer_id,
    'reference',s.reference,'subtotal',s.subtotal,'discount_total',s.discount_total,
    'tax_rate_snapshot',s.tax_rate_snapshot,'tax_total',s.tax_total,'total',s.total,
    'amount_paid',s.amount_paid,'amount_due',s.amount_due,'payment_status',s.payment_status,
    'currency_code',s.currency_code,'secondary_currency_code',s.secondary_currency_code,
    'secondary_exchange_rate',s.secondary_exchange_rate,'exchange_rate_effective_at',s.exchange_rate_effective_at,
    'payment_method',s.payment_method,'created_by',s.created_by,'created_at',s.created_at,
    'store',case when st.id is null then null else jsonb_build_object('name',st.name) end,
    'creator',case when pr.id is null then null else jsonb_build_object('full_name',pr.full_name) end,
    'customer',case when c.id is null then null else jsonb_build_object('name',c.name,'phone',c.phone,'email',c.email) end,
    'sale_items',coalesce((select jsonb_agg(jsonb_build_object(
      'id',si.id,'sale_id',si.sale_id,'product_id',si.product_id,'product_variant_id',si.product_variant_id,
      'sale_price',si.sale_price,'quantity',si.quantity,'discount',si.discount,'line_total',si.line_total,
      'tax_rate_snapshot',si.tax_rate_snapshot,'tax_amount',si.tax_amount,
      'product',jsonb_build_object('name',p.name,'sku',p.sku),
      'variant',case when pv.id is null then null else jsonb_build_object('name',pv.name,'sku',pv.sku) end
    ) order by si.created_at) from public.sale_items si join public.products p on p.id=si.product_id
      left join public.product_variants pv on pv.id=si.product_variant_id where si.sale_id=s.id),'[]'::jsonb)
  )
  from public.sales s left join public.stores st on st.id=s.store_id
  left join public.profiles pr on pr.id=s.created_by left join public.customers c on c.id=s.customer_id
  where s.id=p_sale_id and public.belongs_to_company(s.company_id)
    and public.can_access_store(s.company_id,s.store_id) and public.has_permission(s.company_id,'sales.read');
$$;

grant execute on function public.get_sale_detail_safe(uuid) to authenticated;
revoke all on function public.get_sale_detail_safe(uuid) from anon;
