begin;

-- Troisième régression du même type sur ces 4 vues (voir 202609150003 et
-- 202609190003) : cette fois product_costs est repassée à
-- security_invoker=true, ET sale_financials, sale_item_financials et
-- product_variant_costs ont perdu leur "grant select ... to authenticated"
-- (confirmé en base : plus aucune ligne "authenticated" dans
-- information_schema.role_table_grants pour ces 3 vues). C'est ce qui
-- cause « Les ventes sont chargées, mais leurs bénéfices sont
-- indisponibles. » même quand security_invoker est correct : sans ce
-- grant, PostgREST refuse la vue elle-même (permission denied), quel que
-- soit le réglage security_invoker. Cause probable : une action répétée
-- depuis le dashboard Supabase (Security Advisor et/ou Table Editor), hors
-- du contrôle des migrations.
--
-- Correctif immédiat + garde-fou permanent : en plus de republier les 4
-- vues et leurs grants, une tâche pg_cron réapplique les deux réglages
-- toutes les 10 minutes. Une régression future via le dashboard se corrige
-- alors d'elle-même en quelques minutes au lieu de rester cassée jusqu'à
-- la prochaine vérification manuelle.

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

grant select on public.sale_financials, public.sale_item_financials,
  public.product_costs, public.product_variant_costs to authenticated;

-- Filet de sécurité : réapplique les deux réglages toutes les 10 minutes,
-- pour que le prochain clic sur l'auto-correctif du Security Advisor (ou
-- une révocation manuelle depuis Table Editor) ne casse plus « bénéfices »
-- durablement.
create or replace function private.reassert_financial_view_security()
returns void language plpgsql security definer set search_path = 'public' as $$
begin
  alter view public.sale_financials set (security_invoker = false);
  alter view public.sale_item_financials set (security_invoker = false);
  alter view public.product_costs set (security_invoker = false);
  alter view public.product_variant_costs set (security_invoker = false);
  grant select on public.sale_financials, public.sale_item_financials,
    public.product_costs, public.product_variant_costs to authenticated;
end $$;

revoke all on function private.reassert_financial_view_security() from public, anon, authenticated;

select cron.schedule('stockmaster-reassert-financial-view-security', '*/10 * * * *', 'select private.reassert_financial_view_security()');

notify pgrst, 'reload schema';
commit;
