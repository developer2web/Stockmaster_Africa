begin;

-- Bug réel trouvé en direct (15/09), suite au retour « bénéfices
-- indisponibles / pas l'autorisation » : les 4 vues qui protègent les
-- données financières sensibles (marges des ventes, coût d'achat des
-- produits) étaient TOUTES repassées à security_invoker=true en direct,
-- alors que chaque migration qui les crée dit explicitement
-- security_invoker=FALSE. Confirmé via super_admin_diagnose_view : les 4
-- vues montraient security_invoker=true, sans qu'aucune migration ne
-- l'ait jamais changé — signature typique d'un correctif automatique
-- accepté depuis Database > Security Advisor sur l'avertissement
-- « Security Definer View » (l'Advisor propose de « corriger » ces
-- avertissements en passant security_invoker à true, ce qui est le bon
-- réflexe pour une vue normale mais casse précisément celles-ci, conçues
-- pour fonctionner ainsi : le propriétaire de la vue (postgres) a accès
-- aux colonnes protégées, l'utilisateur qui interroge ne l'a jamais eu
-- directement — la frontière de sécurité est le prédicat
-- is_company_admin()/can_read_product_cost() dans le WHERE, pas les
-- droits sur la table de base. Avec security_invoker=true, Postgres
-- vérifie les droits de l'appelant sur `sales`/`products` directement,
-- qu'il n'a jamais eus (--> "permission denied for table sales").
--
-- IMPORTANT pour la suite : si Security Advisor signale de nouveau ces 4
-- vues comme "Security Definer View", NE PAS accepter son correctif
-- automatique — c'est le comportement voulu ici, documenté juste au-dessus.
create or replace view public.sale_financials
with (security_barrier = true, security_invoker = false) as
  select s.id as sale_id, s.company_id, s.store_id, s.cost_total, s.gross_profit
  from public.sales s
  where public.is_company_admin(s.company_id);

create or replace view public.sale_item_financials
with (security_barrier = true, security_invoker = false) as
  select si.id as sale_item_id, si.sale_id, s.company_id,
         si.purchase_price_snapshot, si.gross_profit
  from public.sale_items si
  join public.sales s on s.id = si.sale_id
  where public.is_company_admin(s.company_id);

create or replace view public.product_costs
with (security_barrier=true,security_invoker=false) as
select p.id as product_id,p.company_id,p.store_id,p.purchase_price
from public.products p
where public.can_read_product_cost(p.company_id,p.store_id);

create or replace view public.product_variant_costs
with (security_barrier=true,security_invoker=false) as
select v.id as product_variant_id,v.product_id,p.company_id,p.store_id,v.purchase_price
from public.product_variants v join public.products p
  on p.id=v.product_id and p.company_id=v.company_id
where public.can_read_product_cost(p.company_id,p.store_id);

alter view public.sale_financials owner to postgres;
alter view public.sale_item_financials owner to postgres;
alter view public.product_costs owner to postgres;
alter view public.product_variant_costs owner to postgres;

notify pgrst, 'reload schema';
commit;
