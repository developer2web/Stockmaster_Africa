begin;

-- Demande explicite du propriétaire : « différences d'heure entre ventes et
-- reçus ». Bug réel en creusant : une vente hors ligne resynchronisée
-- envoie déjà sa vraie heure (p_offline_created_at, capturée sur l'appareil
-- au moment de la vente, validée à +/- 5 min / 7 jours) mais create_sale_v3
-- ne s'en servait que pour une colonne d'audit séparée (offline_created_at)
-- — sales.created_at restait toujours l'heure de SYNCHRONISATION (now() au
-- moment de l'insert initial dans create_sale, plusieurs couches en
-- dessous). Le reçu, la liste des ventes, les rapports affichent tous
-- created_at : une vente faite à 14h hors ligne mais synchronisée à 18h
-- montrait "18h" partout, y compris sur le reçu remis au client.
--
-- Corrigé à la source plutôt qu'en réécrivant après coup : sales.created_at
-- est déjà la bonne valeur dès l'insert initial (create_sale), donc le
-- trigger sync_sale_cash (qui ne se déclenche que sur total/amount_paid/
-- reference/payment_method/store_id, jamais created_at) lit la bonne heure
-- lui aussi dès le départ, sans deuxième correctif nécessaire côté caisse.
--
-- Nettoyage : ajouter un paramètre change la signature complète pour
-- PostgreSQL (CREATE OR REPLACE ne remplace que si la liste de paramètres
-- reste identique) — anciennes surcharges supprimées explicitement plutôt
-- que laissées mortes en base (même leçon que 202609170002).
drop function if exists public.create_sale(uuid,text,jsonb,uuid,uuid);
drop function if exists public.create_sale_v2(uuid,text,jsonb,uuid,numeric,uuid);

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
end
$function$;

create or replace function public.create_sale_v2(p_store_id uuid, p_payment_method text, p_items jsonb, p_customer_id uuid default null, p_amount_paid numeric default null, p_operation_id uuid default gen_random_uuid(), p_created_at timestamptz default null)
returns table(sale_id uuid, reference text, total numeric, gross_profit numeric, amount_paid numeric, amount_due numeric, payment_status text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare result record;paid numeric;due numeric;status text;v_company uuid;v_allow_credit boolean;v_limit numeric;v_balance numeric;
begin
  select * into result from public.create_sale(p_store_id,p_payment_method,p_items,p_customer_id,p_operation_id,p_created_at);
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
  update public.sales s set amount_paid=paid,amount_due=due,payment_status=status where s.id=result.sale_id;
  if due>0 and not exists(select 1 from public.customer_ledger cl where cl.sale_id=result.sale_id and cl.entry_type='credit') then
    insert into public.customer_ledger(company_id,customer_id,store_id,entry_type,amount,sale_id,note,created_by)
    values(v_company,p_customer_id,p_store_id,'credit',due,result.sale_id,'Crédit vente '||result.reference,auth.uid());
  end if;
  sale_id:=result.sale_id;reference:=result.reference;total:=result.total;gross_profit:=result.gross_profit;
  amount_paid:=paid;amount_due:=due;payment_status:=status;return next;
end
$function$;

create or replace function public.create_sale_v3(p_store_id uuid, p_payment_method text, p_items jsonb, p_customer_id uuid default null, p_amount_paid numeric default null, p_operation_id uuid default gen_random_uuid(), p_offline_created_at timestamptz default null, p_offline_device_id text default null)
returns table(sale_id uuid, reference text, total numeric, gross_profit numeric, amount_paid numeric, amount_due numeric, payment_status text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare result record;v_price_changed boolean:=false;v_expected_total numeric;
begin
  if p_offline_created_at is not null then
    if length(trim(coalesce(p_offline_device_id,'')))<8 then raise exception 'Identifiant de l’appareil hors ligne invalide';end if;
    if p_offline_created_at>now()+interval '5 minutes' then raise exception 'L’heure de l’appareil est invalide';end if;
    if p_offline_created_at<now()-interval '7 days' then raise exception 'Reconnexion requise : cette opération hors ligne date de plus de 7 jours';end if;
  end if;

  select * into result from public.create_sale_v2(p_store_id,p_payment_method,p_items,p_customer_id,p_amount_paid,p_operation_id,p_offline_created_at);

  if p_offline_created_at is not null then
    select exists(
      select 1
      from jsonb_array_elements(p_items) item
      join public.sale_items si on si.sale_id=result.sale_id
        and si.product_id=(item->>'productId')::uuid
        and si.product_variant_id is not distinct from nullif(item->>'variantId','')::uuid
      where item ? 'unitPrice'
        and abs(si.sale_price-(item->>'unitPrice')::numeric)>0.005
    ) into v_price_changed;
    if v_price_changed then
      raise exception 'Conflit de prix : un article a changé depuis la vente hors ligne. Vérifiez puis recréez cette vente';
    end if;
    if (p_items->0) ? 'expectedTotal' then
      v_expected_total:=(p_items->0->>'expectedTotal')::numeric;
      if abs(result.total-v_expected_total)>0.01 then
        raise exception 'Conflit de total : les prix ou taxes ont changé depuis la vente hors ligne. Vérifiez puis recréez cette vente';
      end if;
    end if;
  end if;

  update public.sales set offline_created_at=p_offline_created_at,
    offline_device_id=case when p_offline_created_at is null then null else trim(p_offline_device_id) end,
    synced_at=case when p_offline_created_at is null then null else now() end
  where id=result.sale_id and (offline_created_at is null or offline_created_at=p_offline_created_at);
  if p_offline_created_at is not null and not found then raise exception 'Conflit de synchronisation détecté pour cette opération';end if;
  sale_id:=result.sale_id;reference:=result.reference;total:=result.total;gross_profit:=result.gross_profit;
  amount_paid:=result.amount_paid;amount_due:=result.amount_due;payment_status:=result.payment_status;return next;
end
$function$;

grant execute on function public.create_sale(uuid,text,jsonb,uuid,uuid,timestamptz) to authenticated;
grant execute on function public.create_sale_v2(uuid,text,jsonb,uuid,numeric,uuid,timestamptz) to authenticated;
revoke all on function public.create_sale(uuid,text,jsonb,uuid,uuid,timestamptz) from anon;
revoke all on function public.create_sale_v2(uuid,text,jsonb,uuid,numeric,uuid,timestamptz) from anon;

commit;
