begin;

-- Même bug récurrent que 202609150003, revenu sur 2 des 4 vues seulement
-- cette fois (product_costs, product_variant_costs — sale_financials et
-- sale_item_financials étaient encore corrects) : trouvé en vérifiant en
-- direct la migration 202609190001 (elle-même saine), un chargement de la
-- caisse enregistreuse échouait avec « permission denied for table
-- products » / « ... product_variants », signature de
-- security_invoker=true réappliqué depuis Database > Security Advisor
-- (voir le commentaire complet dans 202609150003 : la frontière de
-- sécurité voulue ici est le prédicat can_read_product_cost() dans le
-- WHERE, pas les droits bruts sur la table — security_invoker=true
-- contourne ce prédicat en vérifiant à la place les droits de
-- l'utilisateur sur `products`/`product_variants`, qu'il n'a jamais eus).
-- Confirmé en base juste avant ce correctif : product_costs et
-- product_variant_costs à security_invoker=true, les deux autres vues
-- toujours à false.
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

alter view public.product_costs owner to postgres;
alter view public.product_variant_costs owner to postgres;

notify pgrst, 'reload schema';
commit;
