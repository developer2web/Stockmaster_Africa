begin;

-- Le formulaire envoie « SKU-AUTO » (texte générique, jamais réellement généré)
-- quand l'utilisateur laisse le champ SKU facultatif tel quel. Comme il est
-- identique pour chaque nouveau produit, le 2e produit (ou la 2e variante) créé
-- sans y toucher entrait en collision avec le 1er : « Cette information est
-- déjà utilisée ». Un SKU vide ou valant ce texte générique déclenche
-- maintenant une vraie génération automatique, unique dans la boutique.

create or replace function public.validate_product_codes()
returns trigger language plpgsql set search_path=public as $$
declare v_attempt int;
begin
  if coalesce(trim(new.sku),'')='' or trim(new.sku)='SKU-AUTO' then
    v_attempt:=0;
    loop
      new.sku:='SKU-'||upper(substr(md5(gen_random_uuid()::text),1,8));
      v_attempt:=v_attempt+1;
      exit when v_attempt>=10 or not exists(
        select 1 from products p where p.store_id=new.store_id and p.sku=new.sku and p.id is distinct from new.id
      );
    end loop;
  end if;
  if exists(select 1 from product_variants v join products p on p.id=v.product_id where p.store_id=new.store_id and (v.sku=new.sku or (new.barcode is not null and v.barcode=new.barcode)))
  then raise exception 'Ce SKU ou code-barres est déjà utilisé dans cette boutique'; end if;
  return new;
end $$;

create or replace function public.validate_variant_codes()
returns trigger language plpgsql set search_path=public as $$
declare v_store uuid; v_attempt int;
begin
  select store_id into v_store from products where id=new.product_id;
  if coalesce(trim(new.sku),'')='' or trim(new.sku)='SKU-AUTO' then
    v_attempt:=0;
    loop
      new.sku:='SKU-'||upper(substr(md5(gen_random_uuid()::text),1,8));
      v_attempt:=v_attempt+1;
      exit when v_attempt>=10 or not (
        exists(select 1 from products p where p.store_id=v_store and p.sku=new.sku)
        or exists(select 1 from product_variants v join products p on p.id=v.product_id where p.store_id=v_store and v.id is distinct from new.id and v.sku=new.sku)
      );
    end loop;
  end if;
  if exists(select 1 from products p where p.store_id=v_store and (p.sku=new.sku or (new.barcode is not null and p.barcode=new.barcode)))
    or exists(select 1 from product_variants v join products p on p.id=v.product_id where p.store_id=v_store and v.id<>new.id and (v.sku=new.sku or (new.barcode is not null and v.barcode=new.barcode)))
  then raise exception 'Ce SKU ou code-barres est déjà utilisé dans cette boutique'; end if;
  return new;
end $$;

-- L'appel de création de produit exigeait encore un SKU d'au moins 2
-- caractères avant même d'atteindre le trigger ci-dessus : le champ redevient
-- réellement facultatif, comme son libellé l'indique déjà dans le formulaire.
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
  if length(trim(coalesce(p_name,''))) < 2 then
    raise exception 'Le nom du produit est obligatoire';
  end if;
  if p_purchase_price < 0 or p_sale_price < 0 or p_low_stock_threshold < 0
     or coalesce(p_initial_quantity,0) < 0 then
    raise exception 'Les prix et quantités doivent être positifs';
  end if;

  insert into public.products(
    company_id,store_id,name,description,sku,barcode,category_id,supplier_id,
    unit,purchase_price,sale_price,low_stock_threshold,is_active,created_by
  ) values(
    v_company,p_store_id,trim(p_name),nullif(trim(p_description),''),trim(coalesce(p_sku,'')),
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

notify pgrst,'reload schema';
commit;
