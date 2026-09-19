begin;

-- Retours du 19/09 (côté employé) : le client applique déjà ces règles ; ceci empêche de les
-- contourner en appelant directement l'API.
--
-- STATUT : préparée, NON appliquée à la base distante. Vérifiée seulement sur un schéma minimal dans
-- un vrai Postgres (PGlite : 15 cas, dont vente à 0 avec/sans permission et plafond de caisse), pas sur
-- la base complète (create_sale, audit, autres déclencheurs de `sales`). Avant `supabase db push`,
-- suivre supabase/DESTRUCTIVE_MIGRATIONS.md : sauvegarde restaurable, `supabase migration list --linked`,
-- revue du plan, essai sur une copie de staging.
--
-- Déjà en place côté serveur, sans changement : create_sale refuse un article qui n'appartient pas
-- à la boutique de la vente (`p.store_id = p_store_id`, migration 202609180001), et refuse une
-- remise au-delà de companies.max_discount_percent sans la permission sales.discount_override.

-- 1. Limite de remise par défaut : 10 % pour les nouvelles entreprises (elle valait 100, donc aucune
--    limite). Les entreprises existantes gardent leur réglage : le propriétaire le modifie dans
--    Entreprise > Remise maximale.
alter table public.companies alter column max_discount_percent set default 10;

-- 2. Une vente dont les remises ramènent le total à 0 (remise de 100 %) exige la permission de
--    dépasser la limite de remise (rôles responsable / propriétaire). Contrôle posé sur `sales` plutôt
--    que dans create_sale pour ne pas recopier cette longue fonction : create_sale insère la vente puis
--    met à jour subtotal/total à la fin, c'est cette mise à jour qui est contrôlée.
create or replace function public.guard_zero_total_sale()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.subtotal > 0 and new.total <= 0
     and (tg_op = 'INSERT' or old.subtotal is distinct from new.subtotal)
     and not public.has_permission(new.company_id, 'sales.discount_override') then
    raise exception 'Une vente à 0 nécessite l’autorisation d’un responsable';
  end if;
  return new;
end $$;

drop trigger if exists guard_zero_total_sale on public.sales;
create trigger guard_zero_total_sale
  before insert or update of subtotal, total on public.sales
  for each row execute function public.guard_zero_total_sale();

-- 3. Mouvement de caisse : entier positif d'au plus 1 000 000 000 (le franc guinéen n'a pas de
--    sous-unité ; au-delà, c'est presque sûrement un zéro de trop). Les lignes existantes ne changent pas.
create or replace function public.guard_cash_transaction_amount()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.amount is null or new.amount <= 0 or new.amount <> trunc(new.amount) or new.amount > 1000000000 then
    raise exception 'Le montant doit être un entier positif de 1 000 000 000 au plus';
  end if;
  return new;
end $$;

drop trigger if exists guard_cash_transaction_amount on public.cash_transactions;
create trigger guard_cash_transaction_amount
  before insert on public.cash_transactions
  for each row execute function public.guard_cash_transaction_amount();

commit;
