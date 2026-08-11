alter table public.purchases
  add column if not exists operation_id uuid unique,
  add column if not exists payment_status text not null default 'paid' check (payment_status in ('paid','due'));
alter table public.transfers add column if not exists operation_id uuid unique;

create or replace function public.record_purchase(
  p_store_id uuid, p_supplier_id uuid, p_items jsonb,
  p_paid boolean default true, p_operation_id uuid default gen_random_uuid()
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_company uuid;v_purchase uuid;v_item jsonb;v_product uuid;v_quantity numeric;v_cost numeric;v_total numeric:=0;
begin
  select company_id into v_company from stores where id=p_store_id and is_active and public.can_access_store(company_id,id);
  if v_company is null or not public.has_active_subscription(v_company) or not (public.has_permission(v_company,'stock_movements.write') or public.has_permission(v_company,'suppliers.write')) then raise exception 'Accès approvisionnement refusé';end if;
  if not exists(select 1 from suppliers where id=p_supplier_id and company_id=v_company and store_id=p_store_id and is_active) then raise exception 'Fournisseur invalide';end if;
  select id into v_purchase from purchases where operation_id=p_operation_id;
  if v_purchase is not null then return v_purchase;end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Ajoutez au moins un produit';end if;
  v_purchase:=gen_random_uuid();
  insert into purchases(id,company_id,supplier_id,store_id,total,operation_id,payment_status,created_by) values(v_purchase,v_company,p_supplier_id,p_store_id,0,p_operation_id,case when p_paid then 'paid' else 'due' end,auth.uid());
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_product:=(v_item->>'productId')::uuid;v_quantity:=(v_item->>'quantity')::numeric;v_cost:=(v_item->>'unitCost')::numeric;
    if v_quantity<=0 or v_cost<0 or not exists(select 1 from products where id=v_product and company_id=v_company and store_id=p_store_id and is_active) then raise exception 'Ligne approvisionnement invalide';end if;
    insert into purchase_items(company_id,purchase_id,product_id,quantity,unit_cost,created_by) values(v_company,v_purchase,v_product,v_quantity,v_cost,auth.uid());
    insert into stock_levels(company_id,store_id,product_id,product_variant_id,quantity,created_by) values(v_company,p_store_id,v_product,null,v_quantity,auth.uid()) on conflict(company_id,store_id,product_id,product_variant_id) do update set quantity=stock_levels.quantity+excluded.quantity,updated_at=now();
    insert into stock_movements(company_id,store_id,product_id,quantity,movement_type,operation_id,note,created_by) values(v_company,p_store_id,v_product,v_quantity,'purchase',gen_random_uuid(),'Approvisionnement '||v_purchase,auth.uid());
    update products set purchase_price=v_cost where id=v_product;
    v_total:=v_total+v_quantity*v_cost;
  end loop;
  update purchases set total=v_total where id=v_purchase;
  if p_paid and v_total>0 then insert into cash_transactions(company_id,store_id,transaction_type,designation,amount,source,created_by) values(v_company,p_store_id,'withdrawal','Approvisionnement fournisseur',v_total,'purchase',auth.uid());end if;
  return v_purchase;
end $$;

create or replace function public.transfer_stock(
  p_from_store_id uuid,p_to_store_id uuid,p_product_id uuid,p_quantity numeric,p_operation_id uuid default gen_random_uuid()
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_company uuid;v_target uuid;v_transfer uuid;v_source products%rowtype;
begin
  if p_from_store_id=p_to_store_id or p_quantity<=0 then raise exception 'Transfert invalide';end if;
  select p.* into v_source from products p where p.id=p_product_id and p.store_id=p_from_store_id and p.is_active;
  v_company:=v_source.company_id;
  if v_company is null or not public.can_access_store(v_company,p_from_store_id) or not public.can_access_store(v_company,p_to_store_id) or not public.has_permission(v_company,'stock_movements.write') then raise exception 'Accès transfert refusé';end if;
  select id into v_transfer from transfers where operation_id=p_operation_id;if v_transfer is not null then return v_transfer;end if;
  if coalesce((select quantity from stock_levels where company_id=v_company and store_id=p_from_store_id and product_id=p_product_id and product_variant_id is null for update),0)<p_quantity then raise exception 'Stock insuffisant';end if;
  select id into v_target from products where company_id=v_company and store_id=p_to_store_id and sku=v_source.sku limit 1;
  if v_target is null then insert into products(company_id,store_id,name,description,sku,barcode,unit,purchase_price,sale_price,low_stock_threshold,image_urls,is_active,created_by) values(v_company,p_to_store_id,v_source.name,v_source.description,v_source.sku,v_source.barcode,v_source.unit,v_source.purchase_price,v_source.sale_price,v_source.low_stock_threshold,v_source.image_urls,true,auth.uid()) returning id into v_target;end if;
  update stock_levels set quantity=quantity-p_quantity,updated_at=now() where company_id=v_company and store_id=p_from_store_id and product_id=p_product_id and product_variant_id is null;
  insert into stock_levels(company_id,store_id,product_id,product_variant_id,quantity,created_by) values(v_company,p_to_store_id,v_target,null,p_quantity,auth.uid()) on conflict(company_id,store_id,product_id,product_variant_id) do update set quantity=stock_levels.quantity+excluded.quantity,updated_at=now();
  insert into transfers(id,company_id,from_store_id,to_store_id,status,operation_id,created_by) values(gen_random_uuid(),v_company,p_from_store_id,p_to_store_id,'completed',p_operation_id,auth.uid()) returning id into v_transfer;
  insert into transfer_items(company_id,transfer_id,product_id,quantity,created_by) values(v_company,v_transfer,p_product_id,p_quantity,auth.uid());
  insert into stock_movements(company_id,store_id,product_id,quantity,movement_type,operation_id,note,created_by) values(v_company,p_from_store_id,p_product_id,-p_quantity,'transfer_out',gen_random_uuid(),'Transfert '||v_transfer,auth.uid()),(v_company,p_to_store_id,v_target,p_quantity,'transfer_in',gen_random_uuid(),'Transfert '||v_transfer,auth.uid());
  return v_transfer;
end $$;

grant execute on function public.record_purchase(uuid,uuid,jsonb,boolean,uuid) to authenticated;
grant execute on function public.transfer_stock(uuid,uuid,uuid,numeric,uuid) to authenticated;
revoke all on function public.record_purchase(uuid,uuid,jsonb,boolean,uuid) from anon;
revoke all on function public.transfer_stock(uuid,uuid,uuid,numeric,uuid) from anon;
