-- Phase 5: atomic sales, immutable cost snapshots and profit totals.

alter table public.sales
  add column if not exists reference text,
  add column if not exists subtotal numeric(12,2) not null default 0,
  add column if not exists discount_total numeric(12,2) not null default 0,
  add column if not exists cost_total numeric(12,2) not null default 0,
  add column if not exists gross_profit numeric(12,2) not null default 0;
create unique index if not exists sales_company_reference_unique on public.sales(company_id,reference) where reference is not null;
create index if not exists sales_company_created_idx on public.sales(company_id,created_at desc);
alter table public.sale_items
  add column if not exists product_variant_id uuid references public.product_variants(id),
  add column if not exists line_total numeric(12,2) generated always as ((sale_price * quantity) - discount) stored;
create index if not exists sale_items_sale_idx on public.sale_items(sale_id);
drop policy if exists sale_items_tenant_select on public.sale_items;
drop policy if exists sale_items_tenant_insert on public.sale_items;
drop policy if exists sale_items_tenant_update on public.sale_items;
drop policy if exists sale_items_tenant_delete on public.sale_items;
create policy sale_items_sales_select on public.sale_items for select to authenticated
using (public.belongs_to_company(company_id) and public.has_permission(company_id,'sales.read'));
insert into public.role_permissions(company_id,role_id,permission_id,created_by)
select r.company_id,r.id,p.id,r.created_by from roles r cross join permissions p
where r.code='employee' and lower(r.name)=lower('Employé')
  and p.code in ('sales.read','sales.write','stock_movements.read')
on conflict(role_id,permission_id) do nothing;
create or replace function public.create_sale(
  p_store_id uuid,
  p_payment_method text,
  p_items jsonb,
  p_customer_id uuid default null,
  p_operation_id uuid default gen_random_uuid()
) returns table(sale_id uuid, reference text, total numeric, gross_profit numeric)
language plpgsql security definer set search_path=public as $$
declare
  v_company uuid;
  v_membership_store uuid;
  v_sale uuid;
  v_reference text;
  v_item jsonb;
  v_product uuid;
  v_variant uuid;
  v_quantity numeric;
  v_discount numeric;
  v_purchase numeric;
  v_price numeric;
  v_available numeric;
  v_subtotal numeric := 0;
  v_discounts numeric := 0;
  v_cost numeric := 0;
  v_profit numeric := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>100 then raise exception 'Le panier doit contenir entre 1 et 100 articles'; end if;
  if p_payment_method not in ('cash','card','mobile_money','bank_transfer','mixed') then raise exception 'Moyen de paiement invalide'; end if;

  select m.company_id,m.store_id into v_company,v_membership_store
  from memberships m join roles r on r.id=m.role_id
  where m.user_id=auth.uid() and m.is_active
    and (r.code='company_admin' or public.has_permission(m.company_id,'sales.write')) limit 1;
  if v_company is null or not public.has_active_subscription(v_company) then raise exception 'Accès refusé ou abonnement inactif'; end if;
  if not exists(select 1 from stores where id=p_store_id and company_id=v_company and is_active) then raise exception 'Boutique invalide'; end if;
  if v_membership_store is not null and v_membership_store<>p_store_id and not public.has_permission(v_company,'stores.write') then raise exception 'Cette boutique ne vous est pas attribuée'; end if;
  if p_customer_id is not null and not exists(select 1 from customers where id=p_customer_id and company_id=v_company) then raise exception 'Client invalide'; end if;

  select s.id,s.reference,s.total,s.gross_profit into sale_id,reference,total,gross_profit from sales s where s.operation_id=p_operation_id;
  if sale_id is not null then return next; return; end if;

  v_sale:=gen_random_uuid();
  v_reference:='SM-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(v_sale::text,'-',''),1,8));
  insert into sales(id,company_id,store_id,customer_id,total,payment_method,operation_id,reference,created_by)
  values(v_sale,v_company,p_store_id,p_customer_id,0,p_payment_method,p_operation_id,v_reference,auth.uid());

  for v_item in select value from jsonb_array_elements(p_items) loop
    begin
      v_product=(v_item->>'productId')::uuid;
      v_variant=nullif(v_item->>'variantId','')::uuid;
      v_quantity=(v_item->>'quantity')::numeric;
      v_discount=coalesce((v_item->>'discount')::numeric,0);
    exception when others then raise exception 'Article de vente invalide'; end;
    if v_quantity<=0 then raise exception 'La quantité vendue doit être positive'; end if;

    select p.purchase_price,p.sale_price into v_purchase,v_price from products p where p.id=v_product and p.company_id=v_company and p.is_active;
    if not found then raise exception 'Produit invalide'; end if;
    if v_variant is not null then
      select coalesce(v.purchase_price,v_purchase),coalesce(v.sale_price,v_price) into v_purchase,v_price
      from product_variants v where v.id=v_variant and v.product_id=v_product and v.company_id=v_company and v.is_active;
      if not found then raise exception 'Variante invalide'; end if;
    end if;
    if v_discount<0 or v_discount>v_price*v_quantity then raise exception 'Remise invalide'; end if;

    select sl.quantity into v_available from stock_levels sl
    where sl.company_id=v_company and sl.store_id=p_store_id and sl.product_id=v_product
      and sl.product_variant_id is not distinct from v_variant for update;
    if v_available is null or v_available<v_quantity then raise exception 'Stock insuffisant pour le produit % (disponible: %)',v_product,coalesce(v_available,0); end if;

    update stock_levels set quantity=quantity-v_quantity where company_id=v_company and store_id=p_store_id and product_id=v_product and product_variant_id is not distinct from v_variant;
    insert into stock_movements(company_id,store_id,product_id,product_variant_id,quantity,movement_type,operation_id,note,created_by)
    values(v_company,p_store_id,v_product,v_variant,-v_quantity,'sale',gen_random_uuid(),'Vente '||v_reference,auth.uid());
    insert into sale_items(company_id,sale_id,product_id,product_variant_id,purchase_price_snapshot,sale_price,quantity,discount,created_by)
    values(v_company,v_sale,v_product,v_variant,v_purchase,v_price,v_quantity,v_discount,auth.uid());

    v_subtotal:=v_subtotal+(v_price*v_quantity);
    v_discounts:=v_discounts+v_discount;
    v_cost:=v_cost+(v_purchase*v_quantity);
    v_profit:=v_profit+((v_price-v_purchase)*v_quantity);
  end loop;

  update sales set subtotal=v_subtotal,discount_total=v_discounts,total=v_subtotal-v_discounts,cost_total=v_cost,gross_profit=v_profit where id=v_sale;
  sale_id:=v_sale;reference:=v_reference;total:=v_subtotal-v_discounts;gross_profit:=v_profit;return next;
end $$;
grant execute on function public.create_sale(uuid,text,jsonb,uuid,uuid) to authenticated;
revoke all on function public.create_sale(uuid,text,jsonb,uuid,uuid) from anon;
do $$ begin alter publication supabase_realtime add table public.sales; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.sale_items; exception when duplicate_object then null; end $$;
