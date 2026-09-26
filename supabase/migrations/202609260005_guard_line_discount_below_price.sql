-- Retour testeur du 26/09 (priorité critique) : un employé sans la permission
-- « Dépasser la limite normale de remise » a appliqué 60 000 GNF de remise sur un
-- article à 62 000 GNF. create_sale contrôlait déjà la limite en pourcentage de
-- l'entreprise (max_discount_percent), mais l'entreprise concernée était encore à
-- 100 % (ancienne valeur par défaut = aucune limite), et aucune règle n'interdisait
-- une remise égale ou supérieure au prix de la ligne.
--
-- Garde posé sur sale_items (comme guard_zero_total_sale sur sales) pour ne pas
-- recopier create_sale : toute ligne insérée — vente en ligne ou vente hors ligne
-- synchronisée, qui passent toutes deux par create_sale — est contrôlée ici.
-- Sans la permission sales.discount_override, la remise d'une ligne doit rester
-- strictement inférieure au prix de cette ligne (prix × quantité).
begin;

create or replace function public.guard_sale_item_discount()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(new.discount, 0) > 0
     and new.discount >= new.sale_price * new.quantity
     and not public.has_permission(new.company_id, 'sales.discount_override') then
    raise exception 'La remise doit rester inférieure au prix de l’article (autorisation d’un responsable requise)';
  end if;
  return new;
end $$;

drop trigger if exists guard_sale_item_discount on public.sale_items;
create trigger guard_sale_item_discount
  before insert or update of discount, sale_price, quantity on public.sale_items
  for each row execute function public.guard_sale_item_discount();

-- Fonction de déclencheur : pas d'appel direct (le droit EXECUTE est vérifié à la
-- création du déclencheur, pas à son exécution).
revoke all on function public.guard_sale_item_discount() from public, anon, authenticated;

commit;
