-- Suppression définitive du compte, de son entreprise et de toutes les données
-- associées, explicitement confirmée par le propriétaire du projet.
alter table public.products disable trigger audit_products;
alter table public.product_variants disable trigger audit_product_variants;
alter table public.categories disable trigger audit_categories;
alter table public.suppliers disable trigger audit_suppliers;
alter table public.expenses disable trigger audit_expenses;
alter table public.memberships disable trigger audit_memberships;
alter table public.roles disable trigger audit_roles;
alter table public.stock_movements disable trigger audit_stock_movements;
alter table public.sales disable trigger audit_sales;
alter table public.cash_transactions disable trigger audit_cash_transactions;

do $$
declare
  target_user_id uuid;
begin
  select id into target_user_id
  from auth.users
  where lower(email) = lower('moustapha.amir.diallo@gmail.com');

  if target_user_id is null then
    return;
  end if;

  delete from public.payment_transactions
  where client_id = target_user_id;

  delete from public.companies
  where created_by = target_user_id;

  delete from auth.users
  where id = target_user_id;
end;
$$;

alter table public.products enable trigger audit_products;
alter table public.product_variants enable trigger audit_product_variants;
alter table public.categories enable trigger audit_categories;
alter table public.suppliers enable trigger audit_suppliers;
alter table public.expenses enable trigger audit_expenses;
alter table public.memberships enable trigger audit_memberships;
alter table public.roles enable trigger audit_roles;
alter table public.stock_movements enable trigger audit_stock_movements;
alter table public.sales enable trigger audit_sales;
alter table public.cash_transactions enable trigger audit_cash_transactions;
