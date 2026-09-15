begin;

-- Vente en gros + au détail sur le même produit (proposition acceptée le
-- 15/09, portée réduite à la vente pour cette première version — stock
-- détaillé par pack et réception fournisseur en gros restent pour plus
-- tard). Le stock continue d'être suivi dans une seule unité de base
-- (déjà le cas) ; ces 3 colonnes optionnelles ajoutent juste un second
-- prix pour un lot complet, calculé une seule fois par le propriétaire —
-- jamais par le vendeur au moment de la vente.
alter table public.products
  add column if not exists bulk_unit_label text,
  add column if not exists bulk_quantity numeric(14,3),
  add column if not exists bulk_price numeric(12,2);

alter table public.products drop constraint if exists products_bulk_consistency;
alter table public.products add constraint products_bulk_consistency check (
  (bulk_unit_label is null and bulk_quantity is null and bulk_price is null)
  or (
    nullif(trim(bulk_unit_label),'') is not null
    and bulk_quantity is not null and bulk_quantity > 1
    and bulk_price is not null and bulk_price > 0
  )
);

-- Le nombre de paramètres change (3 ajoutés) : on supprime explicitement
-- l'ancienne signature pour éviter toute ambiguïté de surcharge côté
-- PostgREST, même pattern que pour super_admin_manage_payment plus tôt.
drop function if exists public.create_product_with_initial_stock(uuid,text,text,text,text,uuid,uuid,text,numeric,numeric,numeric,boolean,numeric,uuid);

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
  p_operation_id uuid default gen_random_uuid(),
  p_bulk_unit_label text default null,
  p_bulk_quantity numeric default null,
  p_bulk_price numeric default null
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_company uuid;
  v_product uuid;
  v_bulk_label text := nullif(trim(coalesce(p_bulk_unit_label,'')),'');
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
  if v_bulk_label is not null and (p_bulk_quantity is null or p_bulk_quantity<=1 or p_bulk_price is null or p_bulk_price<=0) then
    raise exception 'Renseignez une quantité (>1) et un prix pour la vente en gros';
  end if;

  insert into public.products(
    company_id,store_id,name,description,sku,barcode,category_id,supplier_id,
    unit,purchase_price,sale_price,low_stock_threshold,is_active,created_by,
    bulk_unit_label,bulk_quantity,bulk_price
  ) values(
    v_company,p_store_id,trim(p_name),nullif(trim(p_description),''),trim(coalesce(p_sku,'')),
    nullif(trim(p_barcode),''),p_category_id,p_supplier_id,p_unit,
    p_purchase_price,p_sale_price,p_low_stock_threshold,p_is_active,auth.uid(),
    v_bulk_label,p_bulk_quantity,p_bulk_price
  ) returning id into v_product;

  if coalesce(p_initial_quantity,0) > 0 then
    perform * from public.record_stock_movement(
      v_product,p_store_id,p_initial_quantity,'initial','Stock initial du produit',
      null,p_operation_id
    );
  end if;
  return v_product;
end $$;
grant execute on function public.create_product_with_initial_stock(uuid,text,text,text,text,uuid,uuid,text,numeric,numeric,numeric,boolean,numeric,uuid,text,numeric,numeric) to authenticated;
revoke all on function public.create_product_with_initial_stock(uuid,text,text,text,text,uuid,uuid,text,numeric,numeric,numeric,boolean,numeric,uuid,text,numeric,numeric) from anon;

notify pgrst,'reload schema';
commit;
