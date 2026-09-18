begin;

-- Nettoyage : les 3 migrations SM-01 (17/09) ont ajouté p_confirm_negative
-- en paramètre supplémentaire via CREATE OR REPLACE, ce qui crée une
-- NOUVELLE surcharge PostgreSQL plutôt que de remplacer l'ancienne (la
-- liste de paramètres n'est plus identique) — les 3 anciennes versions à 5
-- paramètres restaient donc en base, mortes mais présentes. Ni PostgREST ni
-- le client n'appellent jamais ces anciennes signatures (le client envoie
-- toujours p_confirm_negative), donc rien ne change côté app : purement
-- un nettoyage pour éviter toute confusion future.
drop function if exists public.record_cash_transaction(uuid,cash_transaction_type,text,numeric,uuid);
drop function if exists public.record_expense(uuid,text,numeric,date,uuid);
drop function if exists public.record_purchase(uuid,uuid,jsonb,boolean,uuid);

-- Demande explicite du propriétaire (17/09) : un prix d'achat nul devait
-- être refusé comme un prix négatif, pas seulement les négatifs.
create or replace function public.record_purchase(p_store_id uuid, p_supplier_id uuid, p_items jsonb, p_paid boolean default true, p_operation_id uuid default gen_random_uuid(), p_confirm_negative boolean default false)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_company uuid;v_purchase uuid;v_item jsonb;v_product uuid;v_quantity numeric;v_cost numeric;v_total numeric:=0;
begin
  select company_id into v_company from stores where id=p_store_id and is_active and public.can_access_store(company_id,id);
  if v_company is null or not public.has_active_subscription(v_company) or not (public.has_permission(v_company,'stock_movements.write') or public.has_permission(v_company,'suppliers.write')) then raise exception 'Accès approvisionnement refusé';end if;
  if not exists(select 1 from suppliers where id=p_supplier_id and company_id=v_company and store_id=p_store_id and is_active) then raise exception 'Fournisseur invalide';end if;
  if p_confirm_negative and (public.is_company_admin(v_company) or public.has_permission(v_company,'cash_transactions.override_negative_balance')) then
    perform set_config('app.allow_negative_cash','true',true);
  end if;
  perform public.lock_operation(p_operation_id);
  select id into v_purchase from purchases where operation_id=p_operation_id;
  if v_purchase is not null then return v_purchase;end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Ajoutez au moins un produit';end if;
  v_purchase:=gen_random_uuid();
  insert into purchases(id,company_id,supplier_id,store_id,total,amount_paid,amount_due,operation_id,payment_status,created_by) values(v_purchase,v_company,p_supplier_id,p_store_id,0,0,0,p_operation_id,case when p_paid then 'paid' else 'due' end,auth.uid());
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_product:=(v_item->>'productId')::uuid;v_quantity:=(v_item->>'quantity')::numeric;v_cost:=(v_item->>'unitCost')::numeric;
    if v_quantity<=0 or v_cost<=0 or not exists(select 1 from products where id=v_product and company_id=v_company and store_id=p_store_id and is_active) then raise exception 'Ligne approvisionnement invalide';end if;
    insert into purchase_items(company_id,purchase_id,product_id,quantity,unit_cost,created_by) values(v_company,v_purchase,v_product,v_quantity,v_cost,auth.uid());
    insert into stock_levels(company_id,store_id,product_id,product_variant_id,quantity,created_by) values(v_company,p_store_id,v_product,null,v_quantity,auth.uid()) on conflict(company_id,store_id,product_id,product_variant_id) do update set quantity=stock_levels.quantity+excluded.quantity,updated_at=now();
    insert into stock_movements(company_id,store_id,product_id,quantity,movement_type,operation_id,note,created_by) values(v_company,p_store_id,v_product,v_quantity,'purchase',gen_random_uuid(),'Approvisionnement '||v_purchase,auth.uid());
    update products set purchase_price=v_cost where id=v_product;
    v_total:=v_total+v_quantity*v_cost;
  end loop;
  update purchases set total=v_total,amount_paid=case when p_paid then v_total else 0 end,amount_due=case when p_paid then 0 else v_total end where id=v_purchase;
  if p_paid and v_total>0 then insert into cash_transactions(company_id,store_id,transaction_type,designation,amount,source,operation_id,created_by) values(v_company,p_store_id,'withdrawal','Approvisionnement fournisseur',v_total,'purchase',p_operation_id,auth.uid());end if;
  return v_purchase;
end $function$;

-- Bug réel trouvé en creusant « Cette information est déjà utilisée »
-- pendant les transferts entre boutiques : le code-barres devait être
-- unique par ENTREPRISE entière, alors que StockMaster traite un produit
-- comme une fiche propre à chaque boutique (SKU déjà unique par boutique
-- seulement, transfer_stock crée volontairement une fiche séparée dans la
-- boutique de destination, la recherche par code-barres est elle-même
-- limitée à la boutique courante). Dès qu'un produit avec code-barres était
-- transféré, la fiche clonée dans la boutique de destination entrait en
-- collision avec le code-barres du produit source resté dans l'ancienne
-- boutique — la contrainte ne correspondait pas à la façon dont le reste
-- de l'app traite déjà les codes-barres. Recréée à l'échelle de la
-- boutique, cohérente avec products_store_sku_key (déjà par boutique).
drop index if exists public.products_company_barcode_unique;
create unique index if not exists products_store_barcode_unique
  on public.products(store_id, barcode) where barcode is not null;

commit;
