-- Revient à l'état 202609260001 (demande = notification seule, pas de validation/refus).
begin;
drop function if exists public.process_employee_access_removal_request(uuid,boolean,text);
drop function if exists public.list_employee_access_removal_requests(uuid);
drop function if exists public.get_my_employee_access_removal_request(uuid);
create function public.get_my_employee_access_removal_request(p_company_id uuid)
returns table(id uuid, created_at timestamptz)
language sql stable security definer set search_path=public as $$
  select n.id, n.created_at from public.notifications n
  where n.company_id = p_company_id and n.created_by = auth.uid() and n.type = 'employee_access_removal_request'
  order by n.created_at desc limit 1
$$;
grant execute on function public.get_my_employee_access_removal_request(uuid) to authenticated;
revoke all on function public.get_my_employee_access_removal_request(uuid) from anon;
-- request_employee_access_removal : réappliquer la version de 202609251800.
drop table if exists public.employee_access_removal_requests;
notify pgrst,'reload schema';
commit;
