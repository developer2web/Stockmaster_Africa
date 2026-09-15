begin;

-- Nettoyage des comptes de test utilisés pour vérifier en direct que le
-- nouvel essai gratuit démarre bien sur Pro (15/09). Trois entreprises
-- créées pendant le diagnostic (le vrai mécanisme était un trigger, pas
-- create_business comme supposé au départ) : TrialPro Co, TrialPro2
-- Direct, TrialPro3 Co. Aucune n'a de paiement réel (essai seulement),
-- donc les comptes auth peuvent être supprimés normalement.
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

delete from public.companies where name in ('TrialPro Co', 'TrialPro2 Direct', 'TrialPro3 Co');

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

delete from auth.users where email in (
  'moustapha.amir.diallo+trialpro@gmail.com',
  'moustapha.amir.diallo+trialpro2@gmail.com',
  'moustapha.amir.diallo+trialpro3@gmail.com'
);

commit;
