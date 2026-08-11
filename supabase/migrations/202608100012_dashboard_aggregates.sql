create or replace function public.get_admin_overview(p_company_id uuid, p_store_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare v_result jsonb;
begin
  if not public.belongs_to_company(p_company_id)
     or not public.can_access_store(p_company_id,p_store_id)
     or not public.is_company_admin(p_company_id) then
    raise exception 'Accès au tableau de bord refusé';
  end if;

  select jsonb_build_object(
    'products', (select count(*) from public.products p where p.company_id=p_company_id and p.store_id=p_store_id and p.is_active),
    'stockQuantity', coalesce((select sum(sl.quantity) from public.stock_levels sl where sl.company_id=p_company_id and sl.store_id=p_store_id),0),
    'purchaseValue', coalesce((select sum(sl.quantity*p.purchase_price) from public.stock_levels sl join public.products p on p.id=sl.product_id where sl.company_id=p_company_id and sl.store_id=p_store_id),0),
    'expectedRevenue', coalesce((select sum(sl.quantity*p.sale_price) from public.stock_levels sl join public.products p on p.id=sl.product_id where sl.company_id=p_company_id and sl.store_id=p_store_id),0),
    'lowStockProducts', coalesce((select count(distinct sl.product_id) from public.stock_levels sl join public.products p on p.id=sl.product_id where sl.company_id=p_company_id and sl.store_id=p_store_id and sl.quantity<=p.low_stock_threshold),0),
    'customers', (select count(*) from public.customers c where c.company_id=p_company_id and c.is_active),
    'outstandingCredit', coalesce((select sum(greatest(cb.balance,0)) from public.customer_balances cb where cb.company_id=p_company_id),0)
  ) into v_result;
  return v_result;
end $$;

grant execute on function public.get_admin_overview(uuid,uuid) to authenticated;
revoke all on function public.get_admin_overview(uuid,uuid) from anon;
