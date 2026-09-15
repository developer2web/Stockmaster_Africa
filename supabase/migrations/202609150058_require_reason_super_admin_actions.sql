-- Même principe côté Super Admin (admin-web) : motif obligatoire pour
-- désactiver un utilisateur (set_membership_active, aucune trace d'audit
-- avant ce correctif) et pour la suppression définitive d'un compte
-- (super_admin_delete_account_permanently, l'action la plus sévère de la
-- plateforme, sans aucun journal avant ce correctif non plus). La
-- suspension d'entreprise (set_company_active) et le rapprochement
-- Stripe ont déjà leur propre motif obligatoire, non touchés ici.
drop function if exists public.set_membership_active(uuid,boolean);
drop function if exists public.super_admin_delete_account_permanently(uuid);

create or replace function public.set_membership_active(p_membership_id uuid, p_active boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_company uuid;
begin
  if not public.is_super_admin() then raise exception 'Super administrator access required'; end if;
  if not p_active and length(trim(coalesce(p_reason,''))) < 3 then raise exception 'Le motif est obligatoire'; end if;
  update memberships set is_active=p_active where id=p_membership_id returning company_id into v_company;
  if v_company is null then raise exception 'Membership not found'; end if;
  insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by)
  values(v_company,auth.uid(),case when p_active then 'reactivate_membership' else 'deactivate_membership' end,
    'memberships',p_membership_id,jsonb_build_object('reason',coalesce(nullif(trim(p_reason),''),'Réactivation autorisée')),auth.uid());
end $$;
grant execute on function public.set_membership_active(uuid,boolean,text) to authenticated;
revoke all on function public.set_membership_active(uuid,boolean,text) from anon;

create or replace function public.super_admin_delete_account_permanently(p_user_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_detail text; v_company uuid;
begin
  if not public.is_super_admin() then raise exception 'Accès Super Admin requis' using errcode='42501'; end if;
  perform public.assert_session_security(false);
  if length(trim(coalesce(p_reason,''))) < 3 then raise exception 'Le motif est obligatoire'; end if;
  if not exists(select 1 from public.profiles where id=p_user_id) then raise exception 'Compte introuvable'; end if;

  select cb.company_id into v_company from public.client_businesses cb
  where cb.client_id=p_user_id order by cb.is_primary desc, cb.created_at limit 1;
  if v_company is null then
    select m.company_id into v_company from public.memberships m
    where m.user_id=p_user_id order by m.created_at limit 1;
  end if;
  if v_company is not null then
    insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by)
    values(v_company,auth.uid(),'super_admin_delete_account_permanently','profiles',p_user_id,jsonb_build_object('user_id',p_user_id,'reason',trim(p_reason)),auth.uid());
  end if;

  begin
    delete from auth.users where id=p_user_id;
  exception when foreign_key_violation then
    get stacked diagnostics v_detail = pg_exception_detail;
    raise exception 'Suppression physique impossible (donnée non couverte par le nettoyage automatique) : %. Utilisez l''anonymisation (Suppressions) à la place.', coalesce(v_detail,'détail indisponible');
  end;
end $$;
grant execute on function public.super_admin_delete_account_permanently(uuid,text) to authenticated;
revoke all on function public.super_admin_delete_account_permanently(uuid,text) from anon;
