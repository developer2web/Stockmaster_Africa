-- Critical hardening: immutable transactional sales, tenant store scope and discount-aware profit.

create or replace function public.set_created_by()
returns trigger language plpgsql set search_path=public as $$
begin
  if auth.uid() is not null then new.created_by=auth.uid(); end if;
  return new;
end $$;

-- Client writes must go through the atomic RPCs. Reads remain governed by tenant RLS.
drop policy if exists sales_tenant_insert on public.sales;
drop policy if exists sales_tenant_update on public.sales;
drop policy if exists sales_tenant_delete on public.sales;
drop policy if exists stock_movements_tenant_insert on public.stock_movements;
drop policy if exists stock_movements_tenant_update on public.stock_movements;
drop policy if exists stock_movements_tenant_delete on public.stock_movements;

-- A discount reduces both line revenue and line gross profit.
alter table public.sale_items drop column gross_profit;
alter table public.sale_items add column gross_profit numeric(12,2)
  generated always as (((sale_price-purchase_price_snapshot)*quantity)-discount) stored;

update public.sales s set gross_profit=coalesce(x.profit,0)
from (select sale_id,sum(gross_profit) profit from public.sale_items group by sale_id) x
where s.id=x.sale_id;
update public.sales s set gross_profit=0
where not exists(select 1 from public.sale_items si where si.sale_id=s.id);

create or replace function public.record_stock_movement(
  p_product_id uuid,
  p_store_id uuid,
  p_delta numeric,
  p_movement_type text,
  p_note text default null,
  p_variant_id uuid default null,
  p_operation_id uuid default gen_random_uuid()
) returns table(movement_id uuid, new_quantity numeric)
language plpgsql security definer set search_path=public as $$
declare
  v_company uuid;
  v_member_store uuid;
  v_can_all_stores boolean;
  v_level uuid;
  v_current numeric;
  v_movement uuid;
begin
  if p_delta=0 then raise exception 'La quantité doit être différente de zéro'; end if;
  if p_movement_type not in ('initial','adjustment_in','adjustment_out','purchase','sale','transfer_in','transfer_out','inventory') then raise exception 'Type de mouvement invalide'; end if;

  select m.company_id,m.store_id,(r.code='company_admin' or public.has_permission(m.company_id,'stores.write'))
  into v_company,v_member_store,v_can_all_stores
  from memberships m join roles r on r.id=m.role_id
  where m.user_id=auth.uid() and m.is_active
    and (r.code='company_admin' or public.has_permission(m.company_id,'stock_movements.write')) limit 1;
  if v_company is null or not public.has_active_subscription(v_company) then raise exception 'Accès refusé ou abonnement inactif'; end if;
  if not v_can_all_stores and (v_member_store is null or v_member_store<>p_store_id) then raise exception 'Cette boutique ne vous est pas attribuée'; end if;
  if not exists(select 1 from stores where id=p_store_id and company_id=v_company and is_active) then raise exception 'Boutique invalide'; end if;
  if not exists(select 1 from products where id=p_product_id and company_id=v_company and is_active) then raise exception 'Produit invalide'; end if;
  if p_variant_id is not null and not exists(select 1 from product_variants where id=p_variant_id and product_id=p_product_id and company_id=v_company and is_active) then raise exception 'Variante invalide'; end if;

  insert into stock_levels(company_id,store_id,product_id,product_variant_id,quantity,created_by)
  values(v_company,p_store_id,p_product_id,p_variant_id,0,auth.uid())
  on conflict (company_id,store_id,product_id,product_variant_id) do nothing;
  select id,quantity into v_level,v_current from stock_levels
  where company_id=v_company and store_id=p_store_id and product_id=p_product_id
    and product_variant_id is not distinct from p_variant_id for update;
  if v_current+p_delta<0 then raise exception 'Stock insuffisant : quantité disponible %',v_current; end if;
  update stock_levels set quantity=quantity+p_delta where id=v_level returning quantity into new_quantity;
  insert into stock_movements(company_id,store_id,product_id,product_variant_id,quantity,movement_type,operation_id,note,created_by)
  values(v_company,p_store_id,p_product_id,p_variant_id,p_delta,p_movement_type,p_operation_id,nullif(trim(p_note),''),auth.uid()) returning id into v_movement;
  movement_id:=v_movement;return next;
end $$;

create or replace function public.create_sale(
  p_store_id uuid,
  p_payment_method text,
  p_items jsonb,
  p_customer_id uuid default null,
  p_operation_id uuid default gen_random_uuid()
) returns table(sale_id uuid, reference text, total numeric, gross_profit numeric)
language plpgsql security definer set search_path=public as $$
declare
  v_company uuid;v_membership_store uuid;v_sale uuid;v_reference text;v_item jsonb;v_product uuid;v_variant uuid;
  v_quantity numeric;v_discount numeric;v_purchase numeric;v_price numeric;v_available numeric;
  v_subtotal numeric:=0;v_discounts numeric:=0;v_cost numeric:=0;v_profit numeric:=0;
begin
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>100 then raise exception 'Le panier doit contenir entre 1 et 100 articles'; end if;
  if p_payment_method not in ('cash','card','mobile_money','bank_transfer','mixed') then raise exception 'Moyen de paiement invalide'; end if;
  select m.company_id,m.store_id into v_company,v_membership_store from memberships m join roles r on r.id=m.role_id
  where m.user_id=auth.uid() and m.is_active and (r.code='company_admin' or public.has_permission(m.company_id,'sales.write')) limit 1;
  if v_company is null or not public.has_active_subscription(v_company) then raise exception 'Accès refusé ou abonnement inactif'; end if;
  if not exists(select 1 from stores where id=p_store_id and company_id=v_company and is_active) then raise exception 'Boutique invalide'; end if;
  if v_membership_store is not null and v_membership_store<>p_store_id and not public.has_permission(v_company,'stores.write') then raise exception 'Cette boutique ne vous est pas attribuée'; end if;
  if p_customer_id is not null and not exists(select 1 from customers where id=p_customer_id and company_id=v_company) then raise exception 'Client invalide'; end if;
  select s.id,s.reference,s.total,s.gross_profit into sale_id,reference,total,gross_profit from sales s where s.operation_id=p_operation_id and s.company_id=v_company;
  if sale_id is not null then return next;return;end if;

  v_sale:=gen_random_uuid();v_reference:='SM-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(v_sale::text,'-',''),1,8));
  insert into sales(id,company_id,store_id,customer_id,total,payment_method,operation_id,reference,created_by)
  values(v_sale,v_company,p_store_id,p_customer_id,0,p_payment_method,p_operation_id,v_reference,auth.uid());
  for v_item in select value from jsonb_array_elements(p_items) loop
    begin v_product=(v_item->>'productId')::uuid;v_variant=nullif(v_item->>'variantId','')::uuid;v_quantity=(v_item->>'quantity')::numeric;v_discount=coalesce((v_item->>'discount')::numeric,0);
    exception when others then raise exception 'Article de vente invalide';end;
    if v_quantity<=0 then raise exception 'La quantité vendue doit être positive';end if;
    select p.purchase_price,p.sale_price into v_purchase,v_price from products p where p.id=v_product and p.company_id=v_company and p.is_active;
    if not found then raise exception 'Produit invalide';end if;
    if v_variant is not null then select coalesce(v.purchase_price,v_purchase),coalesce(v.sale_price,v_price) into v_purchase,v_price from product_variants v where v.id=v_variant and v.product_id=v_product and v.company_id=v_company and v.is_active;if not found then raise exception 'Variante invalide';end if;end if;
    if v_discount<0 or v_discount>v_price*v_quantity then raise exception 'Remise invalide';end if;
    select sl.quantity into v_available from stock_levels sl where sl.company_id=v_company and sl.store_id=p_store_id and sl.product_id=v_product and sl.product_variant_id is not distinct from v_variant for update;
    if v_available is null or v_available<v_quantity then raise exception 'Stock insuffisant pour le produit % (disponible: %)',v_product,coalesce(v_available,0);end if;
    update stock_levels set quantity=quantity-v_quantity where company_id=v_company and store_id=p_store_id and product_id=v_product and product_variant_id is not distinct from v_variant;
    insert into stock_movements(company_id,store_id,product_id,product_variant_id,quantity,movement_type,operation_id,note,created_by) values(v_company,p_store_id,v_product,v_variant,-v_quantity,'sale',gen_random_uuid(),'Vente '||v_reference,auth.uid());
    insert into sale_items(company_id,sale_id,product_id,product_variant_id,purchase_price_snapshot,sale_price,quantity,discount,created_by) values(v_company,v_sale,v_product,v_variant,v_purchase,v_price,v_quantity,v_discount,auth.uid());
    v_subtotal:=v_subtotal+(v_price*v_quantity);v_discounts:=v_discounts+v_discount;v_cost:=v_cost+(v_purchase*v_quantity);v_profit:=v_profit+((v_price-v_purchase)*v_quantity)-v_discount;
  end loop;
  update sales set subtotal=v_subtotal,discount_total=v_discounts,total=v_subtotal-v_discounts,cost_total=v_cost,gross_profit=v_profit where id=v_sale;
  sale_id:=v_sale;reference:=v_reference;total:=v_subtotal-v_discounts;gross_profit:=v_profit;return next;
end $$;
