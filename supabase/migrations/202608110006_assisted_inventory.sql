alter table public.inventory_items add column if not exists product_variant_id uuid references public.product_variants(id),add column if not exists difference numeric(14,3);
alter table public.inventories add column if not exists validated_by uuid references public.profiles(id),add column if not exists validated_at timestamptz,add column if not exists note text;

create or replace function public.start_store_inventory(p_store_id uuid,p_note text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_company uuid;v_inventory uuid;
begin
  select company_id into v_company from stores where id=p_store_id and is_active;
  if v_company is null or not public.can_access_store(v_company,p_store_id) or not public.has_active_subscription(v_company) or not (public.is_company_admin(v_company) or public.has_permission(v_company,'stock_movements.write')) then raise exception 'Accès inventaire refusé';end if;
  if exists(select 1 from inventories where store_id=p_store_id and status='draft') then select id into v_inventory from inventories where store_id=p_store_id and status='draft' order by created_at desc limit 1;return v_inventory;end if;
  insert into inventories(company_id,store_id,status,note,created_by) values(v_company,p_store_id,'draft',nullif(trim(p_note),''),auth.uid()) returning id into v_inventory;
  insert into inventory_items(company_id,inventory_id,product_id,product_variant_id,expected_quantity,created_by)
  select v_company,v_inventory,sl.product_id,sl.product_variant_id,sl.quantity,auth.uid() from stock_levels sl where sl.company_id=v_company and sl.store_id=p_store_id;
  return v_inventory;
end $$;

create or replace function public.finalize_store_inventory(p_inventory_id uuid,p_counts jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare v_inventory inventories%rowtype;v_count jsonb;v_item inventory_items%rowtype;v_counted numeric;v_difference numeric;
begin
  select * into v_inventory from inventories where id=p_inventory_id for update;
  if not found or v_inventory.status<>'draft' then raise exception 'Inventaire indisponible ou déjà validé';end if;
  if not public.can_access_store(v_inventory.company_id,v_inventory.store_id) or not (public.is_company_admin(v_inventory.company_id) or public.has_permission(v_inventory.company_id,'stock_movements.write')) then raise exception 'Validation inventaire refusée';end if;
  for v_count in select value from jsonb_array_elements(p_counts) loop
    v_counted:=(v_count->>'countedQuantity')::numeric;if v_counted<0 then raise exception 'Une quantité comptée est invalide';end if;
    select * into v_item from inventory_items where id=(v_count->>'itemId')::uuid and inventory_id=p_inventory_id for update;if not found then raise exception 'Ligne inventaire invalide';end if;
    v_difference:=v_counted-v_item.expected_quantity;
    update inventory_items set counted_quantity=v_counted,difference=v_difference where id=v_item.id;
    update stock_levels set quantity=v_counted,updated_at=now() where company_id=v_inventory.company_id and store_id=v_inventory.store_id and product_id=v_item.product_id and product_variant_id is not distinct from v_item.product_variant_id;
    if v_difference<>0 then insert into stock_movements(company_id,store_id,product_id,product_variant_id,quantity,movement_type,operation_id,note,created_by) values(v_inventory.company_id,v_inventory.store_id,v_item.product_id,v_item.product_variant_id,v_difference,'inventory',gen_random_uuid(),'Correction inventaire '||p_inventory_id,auth.uid());end if;
  end loop;
  if exists(select 1 from inventory_items where inventory_id=p_inventory_id and counted_quantity is null) then raise exception 'Toutes les lignes doivent être comptées';end if;
  update inventories set status='completed',counted_at=now(),validated_at=now(),validated_by=auth.uid() where id=p_inventory_id;
end $$;
grant execute on function public.start_store_inventory(uuid,text) to authenticated;grant execute on function public.finalize_store_inventory(uuid,jsonb) to authenticated;
