-- Requested production reset: keep platform super administrators only.
-- All tenant companies, their business data, payments and non-super-admin
-- authentication accounts are removed.

-- Payment transactions use ON DELETE SET NULL for companies but still reference
-- client profiles. Delete them first so non-super-admin profiles can be removed.
delete from public.payment_transactions
where client_id in (
  select id from public.profiles where not is_super_admin
)
and exists (select 1 from public.profiles where is_super_admin);

-- A company belongs to a regular client. Cascades remove its stores, memberships,
-- products, stock, sales, expenses, subscriptions and audit records.
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

delete from public.companies c
where not exists (
  select 1
  from public.client_businesses cb
  join public.profiles p on p.id = cb.client_id
  where cb.company_id = c.id
    and p.is_super_admin
)
and exists (select 1 from public.profiles where is_super_admin);

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

-- Deleting Auth users cascades to profiles and user-scoped records.
delete from auth.users u
where not exists (
  select 1
  from public.profiles p
  where p.id = u.id
    and p.is_super_admin
)
and exists (select 1 from public.profiles where is_super_admin);

-- Remove any orphan non-super profile that did not have an Auth user.
delete from public.profiles
where not is_super_admin
  and exists (
    select 1 from public.profiles protected_profile
    where protected_profile.is_super_admin
  );
