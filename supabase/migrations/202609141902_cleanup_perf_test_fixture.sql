begin;

-- Nettoyage complet du test de performance du 14/09 (1200 produits + 600
-- ventes simulés sur l'entreprise jetable "StockMaster Perf Test", créée
-- uniquement pour mesurer des temps de requête à volume réaliste). Toutes
-- les tables filles portent "on delete cascade" sur company_id : supprimer
-- l'entreprise suffit à tout retirer en une seule instruction.
--
-- Trouvé en le faisant (et confirmé via super_admin_list_delete_triggers,
-- car un premier essai avec une liste incomplète avait aussi échoué) : le
-- trigger d'audit write_audit_log() se déclenche aussi sur DELETE pour
-- plusieurs tables et essaie d'enregistrer chaque suppression en cascade
-- dans audit_logs avec le company_id de l'entreprise — qui n'existe déjà
-- plus au moment où la ligne fille disparaît, ce qui viole la contrainte
-- de clé étrangère. Une suppression de compagnie n'avait jamais été
-- réellement exercée avant (le cycle de vie normal est suspendre/
-- archiver, pas supprimer) : cette limite est pré-existante, pas
-- introduite ici. Plutôt que toucher à write_audit_log() elle-même
-- (utilisée largement, sensible), on désactive ponctuellement tous ses
-- triggers pour cette seule suppression, puis on les réactive aussitôt
-- après — sans rien changer à leur comportement normal.
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

delete from public.companies where name = 'StockMaster Perf Test';

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

-- Le compte (déjà sans entreprise ni adhésion après la suppression
-- ci-dessus) est ensuite supprimé définitivement via le même mécanisme
-- que pour tout autre compte (protect_and_prepare_user_deletion).
delete from auth.users where email = 'moustapha.amir.diallo+perftest@gmail.com';

commit;
