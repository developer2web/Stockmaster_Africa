-- Suite du motif obligatoire côté Super Admin : les demandes de suppression
-- de compte. super_admin_update_account_deletion_request avait déjà un
-- p_note accepté mais jamais utilisé nulle part (ni stocké, ni exigé) —
-- corrigé pour l'exiger et l'enregistrer quand la décision est un refus.
-- super_admin_anonymize_account n'avait aucun motif du tout.
drop function if exists public.super_admin_update_account_deletion_request(uuid,text,text);
drop function if exists public.super_admin_anonymize_account(uuid);

create or replace function public.super_admin_update_account_deletion_request(p_request_id uuid, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_user uuid; v_company uuid;
begin
  if not public.is_super_admin() then raise exception 'Accès Super Admin requis' using errcode='42501'; end if;
  perform public.assert_session_security(false);
  if p_status not in ('pending','processing','completed','rejected','cancelled') then
    raise exception 'Statut invalide';
  end if;
  if p_status='rejected' and length(trim(coalesce(p_note,''))) < 3 then raise exception 'Le motif est obligatoire'; end if;
  update public.account_deletion_requests set
    status=p_status,
    processed_at=case when p_status='pending' then null else now() end,
    processed_by=case when p_status='pending' then null else auth.uid() end
  where id=p_request_id
  returning user_id into v_user;
  if v_user is null then raise exception 'Demande introuvable'; end if;
  if p_status='rejected' then
    select cb.company_id into v_company from public.client_businesses cb
    where cb.client_id=v_user order by cb.is_primary desc, cb.created_at limit 1;
    if v_company is null then
      select m.company_id into v_company from public.memberships m where m.user_id=v_user order by m.created_at limit 1;
    end if;
    if v_company is not null then
      insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by)
      values(v_company,auth.uid(),'reject_account_deletion_request','account_deletion_requests',p_request_id,jsonb_build_object('user_id',v_user,'reason',trim(p_note)),auth.uid());
    end if;
  end if;
end $$;
grant execute on function public.super_admin_update_account_deletion_request(uuid,text,text) to authenticated;
revoke all on function public.super_admin_update_account_deletion_request(uuid,text,text) from anon;

create or replace function public.super_admin_anonymize_account(p_request_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_user_id uuid; v_company uuid;
begin
  if not public.is_super_admin() then raise exception 'Accès Super Admin requis' using errcode='42501'; end if;
  perform public.assert_session_security(false);
  if length(trim(coalesce(p_reason,''))) < 3 then raise exception 'Le motif est obligatoire'; end if;

  select user_id into v_user_id from public.account_deletion_requests where id=p_request_id;
  if v_user_id is null then raise exception 'Demande introuvable'; end if;

  select cb.company_id into v_company from public.client_businesses cb
  where cb.client_id=v_user_id order by cb.is_primary desc, cb.created_at limit 1;
  if v_company is null then
    select m.company_id into v_company from public.memberships m where m.user_id=v_user_id order by m.created_at limit 1;
  end if;
  if v_company is not null then
    insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by)
    values(v_company,auth.uid(),'super_admin_anonymize_account','profiles',v_user_id,jsonb_build_object('user_id',v_user_id,'reason',trim(p_reason)),auth.uid());
  end if;

  update public.profiles
  set full_name='Compte supprimé', avatar_url=null
  where id=v_user_id;

  update public.memberships
  set is_active=false
  where user_id=v_user_id and is_active;

  update auth.users
  set email='deleted+'||v_user_id||'@stockmaster.africa',
    phone=null,
    banned_until=now()+interval '100 years',
    raw_user_meta_data='{}'::jsonb,
    raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)-'must_change_password'
  where id=v_user_id;

  update public.account_deletion_requests
  set status='completed', processed_at=now(), processed_by=auth.uid()
  where id=p_request_id;
end $$;
grant execute on function public.super_admin_anonymize_account(uuid,text) to authenticated;
revoke all on function public.super_admin_anonymize_account(uuid,text) from anon;
