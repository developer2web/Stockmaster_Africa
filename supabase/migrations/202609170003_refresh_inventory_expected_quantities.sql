begin;

-- Demande explicite du propriétaire (17/09) : « actualiser les stocks
-- théoriques des inventaires ». Bug réel en creusant : expected_quantity
-- est un instantané pris une seule fois, au démarrage de l'inventaire
-- (start_store_inventory), jamais rafraîchi ensuite. Si des ventes ou
-- réceptions légitimes ont lieu pendant que l'inventaire reste en brouillon
-- (rien ne bloque l'activité normale pendant un comptage), l'écart affiché
-- à la validation mélange le vrai écart physique avec ces mouvements
-- normaux — et finalize_store_inventory enregistre alors un mouvement
-- "Correction inventaire" pour un delta qui n'a rien d'une perte réelle.
-- Bouton explicite plutôt qu'un rafraîchissement automatique : l'utilisateur
-- choisit quand resynchroniser (typiquement juste avant de valider), sans
-- faire bouger la base de comparaison sous ses pieds pendant qu'il compte.
create or replace function public.refresh_inventory_expected_quantities(p_inventory_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_inventory inventories%rowtype;
begin
  select * into v_inventory from inventories where id=p_inventory_id for update;
  if not found or v_inventory.status<>'draft' then raise exception 'Inventaire indisponible ou déjà validé';end if;
  if not public.can_access_store(v_inventory.company_id,v_inventory.store_id)
     or not (public.is_company_admin(v_inventory.company_id) or public.has_permission(v_inventory.company_id,'stock_movements.write')) then
    raise exception 'Accès inventaire refusé';
  end if;
  update inventory_items ii
    set expected_quantity=sl.quantity
    from stock_levels sl
    where ii.inventory_id=p_inventory_id
      and sl.company_id=v_inventory.company_id
      and sl.store_id=v_inventory.store_id
      and sl.product_id=ii.product_id
      and sl.product_variant_id is not distinct from ii.product_variant_id;
end $function$;

grant execute on function public.refresh_inventory_expected_quantities(uuid) to authenticated;
revoke all on function public.refresh_inventory_expected_quantities(uuid) from anon;

commit;
