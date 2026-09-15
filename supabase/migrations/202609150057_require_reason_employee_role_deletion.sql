-- Motif obligatoire pour les suppressions d'employé/compte/rôle (demande
-- explicite du 15/09, pour la traçabilité de sécurité des données) : même
-- principe déjà en place pour les paiements (Super Admin) et l'annulation
-- d'achat fournisseur, étendu ici. Chaque fonction reprend exactement son
-- corps actuel (vérifié en direct avant modification), avec juste
-- l'ajout de p_reason (>= 3 caractères, sinon refusé) et son enregistrement
-- dans audit_logs.
drop function if exists public.delete_employee(uuid);
drop function if exists public.delete_employee_account_permanently(uuid);
drop function if exists public.delete_employee_role(uuid);

create or replace function public.delete_employee(p_membership_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_company uuid;v_user uuid;v_has_history boolean;
begin
  if length(trim(coalesce(p_reason,''))) < 3 then raise exception 'Le motif est obligatoire';end if;
  select m.company_id,m.user_id into v_company,v_user from public.memberships m
  join public.roles r on r.id=m.role_id where m.id=p_membership_id and r.code='employee';
  if v_company is null or not (public.is_business_owner(v_company) or public.is_company_admin(v_company)) then raise exception 'Accès Administrateur requis';end if;
  if v_user=auth.uid() then raise exception 'Vous ne pouvez pas supprimer votre propre accès';end if;
  select exists(select 1 from public.sales where created_by=v_user and company_id=v_company)
    or exists(select 1 from public.expenses where created_by=v_user and company_id=v_company)
    or exists(select 1 from public.cash_transactions where created_by=v_user and company_id=v_company)
    or exists(select 1 from public.stock_movements where created_by=v_user and company_id=v_company)
    or exists(select 1 from public.purchases where created_by=v_user and company_id=v_company)
    or exists(select 1 from public.supplier_payments where created_by=v_user and company_id=v_company)
    or exists(select 1 from public.customer_ledger where created_by=v_user and company_id=v_company)
    or exists(select 1 from public.sale_returns where created_by=v_user and company_id=v_company)
  into v_has_history;
  if v_has_history then
    update public.memberships set is_active=false where id=p_membership_id;
    insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by)
    values(v_company,auth.uid(),'deactivate_historical_employee','memberships',p_membership_id,jsonb_build_object('user_id',v_user,'reason',trim(p_reason)),auth.uid());
  else
    delete from public.memberships where id=p_membership_id;
    insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by)
    values(v_company,auth.uid(),'delete_unused_employee','memberships',p_membership_id,jsonb_build_object('user_id',v_user,'reason',trim(p_reason)),auth.uid());
  end if;
end $$;
grant execute on function public.delete_employee(uuid,text) to authenticated;
revoke all on function public.delete_employee(uuid,text) from anon;

create or replace function public.delete_employee_account_permanently(p_membership_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_company uuid; v_user uuid; v_role_code text; v_detail text;
begin
  if length(trim(coalesce(p_reason,''))) < 3 then raise exception 'Le motif est obligatoire';end if;
  select m.company_id,m.user_id,r.code into v_company,v_user,v_role_code
  from public.memberships m join public.roles r on r.id=m.role_id where m.id=p_membership_id;
  if v_company is null then raise exception 'Accès introuvable';end if;
  if v_role_code<>'employee' then raise exception 'Cette action ne concerne que les comptes employés';end if;
  if not (public.is_business_owner(v_company) or public.is_company_admin(v_company)) then
    raise exception 'Accès Administrateur requis';
  end if;
  if v_user=auth.uid() then raise exception 'Vous ne pouvez pas supprimer votre propre compte';end if;

  insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by)
  values(v_company,auth.uid(),'delete_employee_account_permanently','memberships',p_membership_id,jsonb_build_object('user_id',v_user,'reason',trim(p_reason)),auth.uid());

  delete from public.memberships where id=p_membership_id;

  begin
    delete from auth.users where id=v_user;
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    raise exception 'Suppression du compte refusée : %',coalesce(nullif(sqlerrm,''),coalesce(v_detail,'raison inconnue'));
  end;
end $$;
grant execute on function public.delete_employee_account_permanently(uuid,text) to authenticated;
revoke all on function public.delete_employee_account_permanently(uuid,text) from anon;

create or replace function public.delete_employee_role(p_role_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_company uuid;
begin
  if length(trim(coalesce(p_reason,''))) < 3 then raise exception 'Le motif est obligatoire';end if;
  select company_id into v_company from roles where id=p_role_id and code='employee';
  if v_company is null or not public.has_permission(v_company,'roles.write') or not public.has_active_subscription(v_company) then raise exception 'Accès refusé'; end if;
  if exists(select 1 from memberships where role_id=p_role_id) then raise exception 'Ce rôle est encore attribué à un employé'; end if;
  insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by)
  values(v_company,auth.uid(),'delete_employee_role','roles',p_role_id,jsonb_build_object('reason',trim(p_reason)),auth.uid());
  delete from roles where id=p_role_id;
end $$;
grant execute on function public.delete_employee_role(uuid,text) to authenticated;
revoke all on function public.delete_employee_role(uuid,text) from anon;
