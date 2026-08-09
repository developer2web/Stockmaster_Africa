-- Preserve the balance before and after every future stock movement.
alter table public.stock_movements
  add column if not exists previous_quantity numeric(14,3),
  add column if not exists new_quantity numeric(14,3);

create or replace function public.set_stock_movement_balances()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  select sl.quantity into new.new_quantity from stock_levels sl
  where sl.company_id=new.company_id and sl.store_id=new.store_id and sl.product_id=new.product_id
    and sl.product_variant_id is not distinct from new.product_variant_id;
  if new.new_quantity is not null then new.previous_quantity=new.new_quantity-new.quantity;end if;
  return new;
end $$;
create trigger set_stock_movement_balances before insert on public.stock_movements
for each row execute function public.set_stock_movement_balances();
