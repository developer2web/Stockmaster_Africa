begin;

-- Suppression physique réelle d'un compte de test (contrairement à
-- l'anonymisation, qui garde une ligne profiles pour préserver la
-- comptabilité des entreprises réelles). Deux garde-fous indépendants
-- empêchent toute erreur sur un vrai client, même mal étiqueté "test" :
--   1. Refus explicite si un paiement a déjà réussi pour ce compte.
--   2. Si ce compte a créé des données encore présentes ailleurs (ventes,
--      produits, mouvements de stock, appartenance à une autre entreprise
--      active...), la suppression échoue proprement (contrainte de clé
--      étrangère) avec un message clair plutôt qu'une erreur technique brute.
create or replace function public.super_admin_delete_account_permanently(p_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_has_payment boolean;
begin
  if not public.is_super_admin() then raise exception 'Accès Super Admin requis' using errcode='42501'; end if;
  perform public.assert_session_security(false);
  if not exists(select 1 from public.profiles where id=p_user_id) then raise exception 'Compte introuvable'; end if;

  select exists(
    select 1 from public.payment_transactions where client_id=p_user_id and status='succeeded'
  ) into v_has_payment;
  if v_has_payment then
    raise exception 'Ce compte a au moins un paiement réussi : suppression physique refusée. Utilisez l''anonymisation (Suppressions) à la place.';
  end if;

  begin
    delete from auth.users where id=p_user_id;
  exception when foreign_key_violation then
    raise exception 'Ce compte a des données encore présentes (ventes, produits, mouvements de stock, ou appartenance à une entreprise active) : suppression physique impossible tant qu''elles existent. Utilisez l''anonymisation (Suppressions) à la place.';
  end;
end $$;
grant execute on function public.super_admin_delete_account_permanently(uuid) to authenticated;
revoke all on function public.super_admin_delete_account_permanently(uuid) from anon;

notify pgrst,'reload schema';
commit;
