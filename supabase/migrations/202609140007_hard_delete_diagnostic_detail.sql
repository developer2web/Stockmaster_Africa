begin;

-- Diagnostic seulement : remonte le détail Postgres exact (table/contrainte)
-- quand une suppression physique échoue encore, pour ne pas avoir à deviner
-- table par table ce qui bloque.
create or replace function public.super_admin_delete_account_permanently(p_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_has_payment boolean; v_has_active_membership boolean; v_detail text;
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
    get stacked diagnostics v_detail = pg_exception_detail;
    raise exception 'Suppression physique impossible : %', coalesce(v_detail,'détail indisponible');
  end;
end $$;
grant execute on function public.super_admin_delete_account_permanently(uuid) to authenticated;
revoke all on function public.super_admin_delete_account_permanently(uuid) from anon;

notify pgrst,'reload schema';
commit;
