begin;

-- Un compte peut avoir traité quelques opérations réelles (ventes, mouvements
-- de stock...) sans que ce soit son propre historique : ce sont des données
-- de l'ENTREPRISE. Les effacer avec lui abîmerait la comptabilité d'une
-- entreprise active pour quelqu'un d'autre. À la place, la suppression
-- physique retire maintenant seulement son attribution ("créé par") sur ces
-- lignes avant de le supprimer : la vente, le montant, la date restent
-- intacts, simplement sans nom rattaché. Nouveau garde-fou : refusé aussi si
-- son accès à une entreprise est encore actif (désactiver d'abord).
create or replace function public.super_admin_delete_account_permanently(p_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_has_payment boolean; v_has_active_membership boolean;
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

  select exists(
    select 1 from public.memberships where user_id=p_user_id and is_active
  ) into v_has_active_membership;
  if v_has_active_membership then
    raise exception 'Ce compte a encore un accès actif dans une entreprise : désactivez-le d''abord (Utilisateurs), puis réessayez.';
  end if;

  update public.sales set created_by=null where created_by=p_user_id;
  update public.sale_items set created_by=null where created_by=p_user_id;
  update public.stock_movements set created_by=null where created_by=p_user_id;
  update public.cash_transactions set created_by=null where created_by=p_user_id;
  update public.purchases set created_by=null where created_by=p_user_id;
  update public.expenses set created_by=null where created_by=p_user_id;
  update public.products set created_by=null where created_by=p_user_id;

  begin
    delete from auth.users where id=p_user_id;
  exception when foreign_key_violation then
    raise exception 'Ce compte a encore des données liées ailleurs, hors du nettoyage automatique couvert : suppression physique impossible. Utilisez l''anonymisation (Suppressions) à la place.';
  end;
end $$;
grant execute on function public.super_admin_delete_account_permanently(uuid) to authenticated;
revoke all on function public.super_admin_delete_account_permanently(uuid) from anon;

notify pgrst,'reload schema';
commit;
