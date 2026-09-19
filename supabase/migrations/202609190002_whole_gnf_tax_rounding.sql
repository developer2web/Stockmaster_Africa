begin;

-- Trouvé en vérifiant 202609190001 (garde-fou cash_transactions : montant
-- entier obligatoire) contre create_sale en entier, comme son propre
-- commentaire le demandait avant application. create_sale arrondit la taxe
-- par ligne à 2 décimales (round(...,2)) — un centime de GNF qui n'existe
-- pas. Actuellement aucune entreprise n'a de taux de taxe non nul (vérifié
-- en base), donc dormant, mais dès qu'une entreprise activerait une taxe,
-- une vente pourrait produire un total fractionnaire, que le nouveau garde-
-- fou cash_transactions rejetterait au moment de l'encaissement — la vente
-- resterait bloquée en plein paiement. Arrondi au GNF entier le plus
-- proche, cohérent avec le reste de l'app (GNF n'a pas de sous-unité).
create or replace function public.create_sale(p_store_id uuid, p_payment_method text, p_items jsonb, p_customer_id uuid default null, p_operation_id uuid default gen_random_uuid(), p_created_at timestamptz default null)
returns table(sale_id uuid, reference text, total numeric, gross_profit numeric)
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  insert into public.sales(id,company_id,store_id,customer_id,total,payment_method,operation_id,reference,created_by,tax_rate_snapshot,created_at)
  values(v_sale,v_company,p_store_id,p_customer_id,0,p_payment_method,p_operation_id,v_reference,auth.uid(),coalesce(v_tax_rate,0),coalesce(p_created_at,now()));

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
    -- round(numeric) sans 2e argument : arrondi à l'entier le plus proche,
    -- pas de centime de GNF (contrairement à round(...,2) précédent).
    v_line_tax:=round(v_line_net*coalesce(v_tax_rate,0)/100);
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
end
$function$;

commit;
