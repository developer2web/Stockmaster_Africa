begin;

-- Nettoyage du compte de test utilisé pour vérifier en direct les
-- changements d'interface du 15/09 (grille produits, indicateur panier,
-- bandeau essai, bouton déconnexion). Même mécanisme que le nettoyage du
-- test de performance du 14/09 (202609141902) : désactivation ponctuelle
-- des triggers d'audit concernés, suppression en cascade via l'entreprise,
-- réactivation immédiate.
alter table public.memberships disable trigger audit_memberships;
alter table public.sales disable trigger audit_sales;
alter table public.products disable trigger audit_products;
alter table public.product_variants disable trigger audit_product_variants;
alter table public.suppliers disable trigger audit_suppliers;
alter table public.stock_movements disable trigger audit_stock_movements;
alter table public.categories disable trigger audit_categories;
alter table public.supplier_payments disable trigger audit_supplier_payments;
alter table public.cash_transactions disable trigger audit_cash_transactions;
alter table public.roles disable trigger audit_roles;
alter table public.expenses disable trigger audit_expenses;

delete from public.companies where name = 'UI Verify Co';

alter table public.memberships enable trigger audit_memberships;
alter table public.sales enable trigger audit_sales;
alter table public.products enable trigger audit_products;
alter table public.product_variants enable trigger audit_product_variants;
alter table public.suppliers enable trigger audit_suppliers;
alter table public.stock_movements enable trigger audit_stock_movements;
alter table public.categories enable trigger audit_categories;
alter table public.supplier_payments enable trigger audit_supplier_payments;
alter table public.cash_transactions enable trigger audit_cash_transactions;
alter table public.roles enable trigger audit_roles;
alter table public.expenses enable trigger audit_expenses;

delete from auth.users where email = 'moustapha.amir.diallo+uiverify@gmail.com';

commit;
