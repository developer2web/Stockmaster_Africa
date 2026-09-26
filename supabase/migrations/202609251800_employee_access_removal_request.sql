-- Option B for employee-initiated departures: an active employee can ask to
-- have their own access removed. This does NOT create a new approval/status
-- workflow — it simply notifies the company's admin(s), who then act using
-- the already-existing "Retirer l'accès" tool (deleteEmployee) on
-- (admin)/employees.tsx. Full StockMaster account deletion stays, separately,
-- on the existing Super-Admin-reviewed path (request_account_deletion).
begin;

create or replace function public.request_employee_access_removal(p_company_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_full_name text;
  v_body text;
  v_is_employee boolean;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;

  select exists(
    select 1 from public.memberships m
    join public.roles r on r.id=m.role_id
    where m.user_id=auth.uid() and m.company_id=p_company_id and m.is_active and r.code='employee'
  ) into v_is_employee;

  if not v_is_employee then
    raise exception 'Aucun accès employé actif n''a été trouvé pour cette entreprise.';
  end if;

  select full_name into v_full_name from public.profiles where id=auth.uid();

  v_body := coalesce(nullif(trim(v_full_name),''),'Un employé')||' souhaite que son accès à cette entreprise soit retiré.';
  if p_reason is not null and trim(p_reason)<>'' then
    v_body := v_body||E'\nMotif : '||trim(p_reason);
  end if;

  insert into public.notifications(company_id,user_id,title,body,type,created_by)
  select p_company_id, m.user_id, 'Demande de retrait d''accès employé', v_body, 'employee_access_removal_request', auth.uid()
  from public.memberships m
  join public.roles r on r.id=m.role_id
  where m.company_id=p_company_id and m.is_active and r.code='company_admin';
end
$$;

grant execute on function public.request_employee_access_removal(uuid,text) to authenticated;
revoke all on function public.request_employee_access_removal(uuid,text) from anon;

notify pgrst,'reload schema';
commit;
