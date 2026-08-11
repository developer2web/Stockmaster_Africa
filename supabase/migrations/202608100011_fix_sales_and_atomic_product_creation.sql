-- Fix credit/partial sales and make product + initial stock one transaction.

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
  update public.sales s
  set amount_paid=paid, amount_due=due, payment_status=status
  where s.id=result.sale_id;
  if due > 0 and not exists(
    select 1 from public.customer_ledger cl
    where cl.sale_id=result.sale_id and cl.entry_type='credit'
  ) then
    insert into public.customer_ledger(
      company_id,customer_id,store_id,entry_type,amount,sale_id,note,created_by
    )
    select s.company_id,p_customer_id,s.store_id,'credit',due,s.id,
      'Crédit vente '||s.reference,auth.uid()
    from public.sales s where s.id=result.sale_id;
  end if;
  sale_id:=result.sale_id; reference:=result.reference; total:=result.total;
  gross_profit:=result.gross_profit; amount_paid:=paid; amount_due:=due;
  payment_status:=status;
  return next;
end $$;

grant execute on function public.create_sale_v2(uuid,text,jsonb,uuid,numeric,uuid) to authenticated;
revoke all on function public.create_sale_v2(uuid,text,jsonb,uuid,numeric,uuid) from anon;

create or replace function public.create_product_with_initial_stock(
  p_store_id uuid,
  p_name text,
  p_description text,
  p_sku text,
  p_barcode text,
  p_category_id uuid,
  p_supplier_id uuid,
  p_unit text,
  p_purchase_price numeric,
  p_sale_price numeric,
  p_low_stock_threshold numeric,
  p_is_active boolean,
  p_initial_quantity numeric default 0,
  p_operation_id uuid default gen_random_uuid()
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_company uuid;
  v_product uuid;
begin
  select s.company_id into v_company from public.stores s
  where s.id=p_store_id and s.is_active;
  if v_company is null or not public.can_access_store(v_company,p_store_id)
     or not public.has_active_subscription(v_company)
     or not public.has_permission(v_company,'products.write') then
    raise exception 'Accès refusé, boutique invalide ou abonnement inactif';
  end if;
  if length(trim(coalesce(p_name,''))) < 2 or length(trim(coalesce(p_sku,''))) < 2 then
    raise exception 'Le nom et le SKU sont obligatoires';
  end if;
  if p_purchase_price < 0 or p_sale_price < 0 or p_low_stock_threshold < 0
     or coalesce(p_initial_quantity,0) < 0 then
    raise exception 'Les prix et quantités doivent être positifs';
  end if;

  insert into public.products(
    company_id,store_id,name,description,sku,barcode,category_id,supplier_id,
    unit,purchase_price,sale_price,low_stock_threshold,is_active,created_by
  ) values(
    v_company,p_store_id,trim(p_name),nullif(trim(p_description),''),trim(p_sku),
    nullif(trim(p_barcode),''),p_category_id,p_supplier_id,p_unit,
    p_purchase_price,p_sale_price,p_low_stock_threshold,p_is_active,auth.uid()
  ) returning id into v_product;

  if coalesce(p_initial_quantity,0) > 0 then
    perform * from public.record_stock_movement(
      v_product,p_store_id,p_initial_quantity,'initial','Stock initial du produit',
      null,p_operation_id
    );
  end if;
  return v_product;
end $$;

grant execute on function public.create_product_with_initial_stock(
  uuid,text,text,text,text,uuid,uuid,text,numeric,numeric,numeric,boolean,numeric,uuid
) to authenticated;
revoke all on function public.create_product_with_initial_stock(
  uuid,text,text,text,text,uuid,uuid,text,numeric,numeric,numeric,boolean,numeric,uuid
) from anon;
