begin;

-- Nettoyage du compte de test utilisé pour vérifier en direct le
-- rapprochement automatique Stripe (15/09). Contrairement aux nettoyages
-- précédents, ce compte a un vrai paiement réussi (même en mode test) :
-- la suppression physique du compte auth est refusée par le garde-fou
-- prévu à cet effet (suppression Super Admin normale = anonymisation, pas
-- delete brut) — comportement correct, pas contourné ici. Seule la
-- donnée d'entreprise (la partie qui compte pour la propreté de la base)
-- est retirée ; le compte auth de test reste, vide de toute entreprise.
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

delete from public.companies where name = 'StripeQA Co';

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

commit;
