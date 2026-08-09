-- Phase 4: QR/barcode lookup and transactional stock movements.

alter table public.stock_movements
  add column if not exists product_variant_id uuid references public.product_variants(id),
  add column if not exists note text;

create table public.stock_levels (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  product_variant_id uuid references public.product_variants(id) on delete cascade,
  quantity numeric(14,3) not null default 0 check (quantity >= 0),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (company_id, store_id, product_id, product_variant_id)
);

create index stock_movements_company_product_created_idx on public.stock_movements(company_id, product_id, created_at desc);
create index stock_levels_company_store_idx on public.stock_levels(company_id, store_id);

create trigger touch_updated_at before update on public.stock_levels for each row execute function public.touch_updated_at();
create trigger set_created_by before insert on public.stock_levels for each row execute function public.set_created_by();

alter table public.stock_levels enable row level security;
create policy stock_levels_tenant_select on public.stock_levels for select to authenticated
using (public.belongs_to_company(company_id) and public.has_permission(company_id, 'stock_movements.read'));

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
  v_level uuid;
  v_current numeric;
  v_movement uuid;
begin
  if p_delta = 0 then raise exception 'La quantité doit être différente de zéro'; end if;
  if p_movement_type not in ('initial','adjustment_in','adjustment_out','purchase','sale','transfer_in','transfer_out','inventory') then
    raise exception 'Type de mouvement invalide';
  end if;

  select m.company_id into v_company
  from memberships m join roles r on r.id=m.role_id
  where m.user_id=auth.uid() and m.is_active
    and (r.code='company_admin' or public.has_permission(m.company_id,'stock_movements.write'))
  limit 1;
  if v_company is null or not public.has_active_subscription(v_company) then raise exception 'Accès refusé ou abonnement inactif'; end if;
  if not exists(select 1 from stores where id=p_store_id and company_id=v_company and is_active) then raise exception 'Boutique invalide'; end if;
  if not exists(select 1 from products where id=p_product_id and company_id=v_company and is_active) then raise exception 'Produit invalide'; end if;
  if p_variant_id is not null and not exists(select 1 from product_variants where id=p_variant_id and product_id=p_product_id and company_id=v_company and is_active) then raise exception 'Variante invalide'; end if;

  insert into stock_levels(company_id,store_id,product_id,product_variant_id,quantity,created_by)
  values(v_company,p_store_id,p_product_id,p_variant_id,0,auth.uid())
  on conflict (company_id,store_id,product_id,product_variant_id) do nothing;

  select id,quantity into v_level,v_current from stock_levels
  where company_id=v_company and store_id=p_store_id and product_id=p_product_id
    and product_variant_id is not distinct from p_variant_id for update;
  if v_current + p_delta < 0 then raise exception 'Stock insuffisant : quantité disponible %', v_current; end if;

  update stock_levels set quantity=quantity+p_delta where id=v_level returning quantity into new_quantity;
  insert into stock_movements(company_id,store_id,product_id,product_variant_id,quantity,movement_type,operation_id,note,created_by)
  values(v_company,p_store_id,p_product_id,p_variant_id,p_delta,p_movement_type,p_operation_id,nullif(trim(p_note),''),auth.uid())
  returning id into v_movement;
  movement_id := v_movement;
  return next;
end $$;

grant execute on function public.record_stock_movement(uuid,uuid,numeric,text,text,uuid,uuid) to authenticated;
revoke all on function public.record_stock_movement(uuid,uuid,numeric,text,text,uuid,uuid) from anon;

create or replace function public.lookup_product_code(p_code text)
returns table(product_id uuid, variant_id uuid)
language sql stable security definer set search_path=public as $$
  with tenant as (
    select m.company_id from memberships m where m.user_id=auth.uid() and m.is_active limit 1
  )
  select p.id,null::uuid from products p,tenant t
  where p.company_id=t.company_id and p.is_active and (p.qr_code=p_code or p.sku=p_code or p.barcode=p_code)
  union all
  select v.product_id,v.id from product_variants v join tenant t on t.company_id=v.company_id
  where v.is_active and (v.sku=p_code or v.barcode=p_code)
  limit 1
$$;
grant execute on function public.lookup_product_code(text) to authenticated;
revoke all on function public.lookup_product_code(text) from anon;

do $$ begin
  alter publication supabase_realtime add table public.stock_movements;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.stock_levels;
exception when duplicate_object then null; end $$;
