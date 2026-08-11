-- =====================================================================
-- Confidentialité financière au niveau SQL (ventes)
-- ---------------------------------------------------------------------
-- Objectif : empêcher un employé de lire le coût et le bénéfice des
-- ventes par une requête Supabase directe (les colonnes étaient déjà
-- masquées dans l'interface, mais accessibles côté API).
--
-- Principe :
--   1. Un helper `is_company_admin(company_id)` (admin ou super-admin).
--   2. On retire aux comptes `authenticated` le droit de lire les
--      colonnes financières des tables `sales` et `sale_items`, tout en
--      leur redonnant l'accès à TOUTES les autres colonnes (liste
--      générée dynamiquement pour ne rien oublier).
--   3. Deux vues `sale_financials` / `sale_item_financials` exposent ces
--      colonnes UNIQUEMENT aux administrateurs (0 ligne pour un employé).
--
-- ⚠️ À déployer AVEC la version de l'app qui lit les financials via ces
--    vues (getSales / getSale / getFinancialDetails). Sinon les écrans
--    ventes afficheront une erreur "permission denied for column".
-- =====================================================================

-- 1. Helper administrateur ------------------------------------------------
create or replace function public.is_company_admin(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin() or exists (
    select 1
    from memberships m
    join roles r on r.id = m.role_id
    where m.user_id = auth.uid()
      and m.is_active
      and m.company_id = p_company_id
      and r.code = 'company_admin'
  );
$$;

grant execute on function public.is_company_admin(uuid) to authenticated;
revoke all on function public.is_company_admin(uuid) from anon;

-- 2. Verrouillage colonne sur public.sales --------------------------------
do $$
declare v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ')
    into v_cols
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'sales'
     and column_name not in ('cost_total', 'gross_profit');

  execute 'revoke select on public.sales from authenticated';
  execute 'grant select (' || v_cols || ') on public.sales to authenticated';
end $$;

-- 3. Verrouillage colonne sur public.sale_items ---------------------------
do $$
declare v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ')
    into v_cols
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'sale_items'
     and column_name not in ('purchase_price_snapshot', 'gross_profit');

  execute 'revoke select on public.sale_items from authenticated';
  execute 'grant select (' || v_cols || ') on public.sale_items to authenticated';
end $$;

-- 4. Vues admin exposant les financials -----------------------------------
create or replace view public.sale_financials
with (security_barrier) as
  select s.id as sale_id, s.company_id, s.store_id, s.cost_total, s.gross_profit
  from public.sales s
  where public.is_company_admin(s.company_id);

grant select on public.sale_financials to authenticated;

create or replace view public.sale_item_financials
with (security_barrier) as
  select si.id as sale_item_id, si.sale_id, s.company_id,
         si.purchase_price_snapshot, si.gross_profit
  from public.sale_items si
  join public.sales s on s.id = si.sale_id
  where public.is_company_admin(s.company_id);

grant select on public.sale_item_financials to authenticated;

-- =====================================================================
-- OPTIONNEL (à activer après test) : même protection sur le prix d'achat
-- des produits. NON activé ici car certains employés disposant de
-- `products.write` éditent légitimement le prix d'achat depuis la fiche
-- produit. Pour le verrouiller, introduisez d'abord une permission
-- dédiée (ex. `products.read_cost`) puis adaptez `is_company_admin`.
-- =====================================================================
