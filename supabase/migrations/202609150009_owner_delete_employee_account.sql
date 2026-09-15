begin;

-- Décision du propriétaire (15/09) : en plus de delete_employee() (qui ne
-- retire que l'accès à l'entreprise, jamais le compte), permettre de
-- supprimer aussi le compte StockMaster personnel de l'employé — avec les
-- mêmes garde-fous que pour n'importe quel compte (voir
-- protect_and_prepare_user_deletion, déjà utilisée par
-- super_admin_delete_account_permanently) : refusé automatiquement si
-- l'employé a un paiement réussi à son nom, ou s'il travaille encore
-- ailleurs (une autre adhésion active, y compris dans une autre
-- entreprise) — on ne supprime jamais le compte de quelqu'un qui a encore
-- besoin d'y accéder autre part. L'accès à CETTE entreprise est retiré
-- juste avant la tentative de suppression du compte, dans la même
-- transaction : si la suppression du compte est refusée, tout est annulé
-- (l'accès n'est pas perdu pour rien).
create or replace function public.delete_employee_account_permanently(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_company uuid; v_user uuid; v_role_code text; v_detail text;
begin
  select m.company_id,m.user_id,r.code into v_company,v_user,v_role_code
  from public.memberships m join public.roles r on r.id=m.role_id where m.id=p_membership_id;
  if v_company is null then raise exception 'Accès introuvable';end if;
  if v_role_code<>'employee' then raise exception 'Cette action ne concerne que les comptes employés';end if;
  if not (public.is_business_owner(v_company) or public.is_company_admin(v_company)) then
    raise exception 'Accès Administrateur requis';
  end if;
  if v_user=auth.uid() then raise exception 'Vous ne pouvez pas supprimer votre propre compte';end if;

  delete from public.memberships where id=p_membership_id;

  begin
    delete from auth.users where id=v_user;
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    raise exception 'Suppression du compte refusée : %',coalesce(nullif(sqlerrm,''),coalesce(v_detail,'raison inconnue'));
  end;
end $$;
alter function public.delete_employee_account_permanently(uuid) owner to postgres;
revoke all on function public.delete_employee_account_permanently(uuid) from public,anon;
grant execute on function public.delete_employee_account_permanently(uuid) to authenticated;

notify pgrst,'reload schema';
commit;
