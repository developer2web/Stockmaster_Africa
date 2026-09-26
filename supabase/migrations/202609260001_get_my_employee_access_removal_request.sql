-- Permet à un employé de savoir si sa propre demande de retrait d'accès
-- (request_employee_access_removal, 202609251800) est déjà en cours pour
-- cette entreprise, sans lui donner accès à la table notifications en
-- général (RLS: notifications_recipient_select ne l'autorise que pour les
-- lignes où il est le destinataire user_id — ici il n'est que created_by,
-- puisque le destinataire réel est l'administrateur). Toujours "en cours"
-- tant qu'il peut encore voir cet écran : si l'administrateur avait déjà
-- traité la demande (deleteEmployee), son accès serait révoqué et il ne
-- pourrait plus charger cette page du tout.
begin;

create or replace function public.get_my_employee_access_removal_request(p_company_id uuid)
returns table(id uuid, created_at timestamptz)
language sql
stable
security definer
set search_path=public
as $$
  select n.id, n.created_at
  from public.notifications n
  where n.company_id = p_company_id
    and n.created_by = auth.uid()
    and n.type = 'employee_access_removal_request'
  order by n.created_at desc
  limit 1
$$;

grant execute on function public.get_my_employee_access_removal_request(uuid) to authenticated;
revoke all on function public.get_my_employee_access_removal_request(uuid) from anon;

notify pgrst,'reload schema';
commit;
