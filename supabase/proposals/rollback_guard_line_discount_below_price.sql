begin;
drop trigger if exists guard_sale_item_discount on public.sale_items;
drop function if exists public.guard_sale_item_discount();
commit;
