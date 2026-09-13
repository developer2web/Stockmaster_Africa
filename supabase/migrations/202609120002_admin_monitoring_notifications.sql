begin;
create function public.mark_notifications_read(p_company_id uuid)
returns uuid[] language plpgsql security definer set search_path='' as $$
declare changed uuid[];
begin
  if not exists(select 1 from auth.users u where u.id=auth.uid()
    and (u.banned_until is null or u.banned_until<=now())
    and coalesce(u.raw_app_meta_data->>'must_change_password','false')<>'true'
    and ((auth.jwt()->>'aal')='aal2' or not exists(select 1 from auth.mfa_factors f where f.user_id=u.id and f.status='verified')))
    then raise exception 'Vérifiez votre connexion et la sécurité de votre session.' using errcode='42501'; end if;
  with updated as (
    update public.notifications n set read_at=now()
    where n.company_id=p_company_id and n.read_at is null and n.created_at>now()-interval '48 hours'
      and (n.user_id=auth.uid() or (n.user_id is null and public.is_company_admin(n.company_id)))
    returning n.id
  ) select coalesce(array_agg(id),'{}'::uuid[]) into changed from updated;
  return changed;
end $$;
revoke all on function public.mark_notifications_read(uuid) from public,anon;
grant execute on function public.mark_notifications_read(uuid) to authenticated;

create or replace function public.super_admin_resolve_all_errors(p_before timestamptz default now(),p_note text default null)
returns integer language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
  -- Existing settings RPC checks both Super Admin role and MFA/session state.
  perform public.super_admin_billing_email_settings();
  if p_before is null then raise exception 'Date de résolution requise'; end if;
  update public.app_error_events set resolved_at=now(),resolved_by=auth.uid(),
    resolution_note=coalesce(nullif(left(trim(coalesce(p_note,'')),500),''),'Résolution groupée par le Super Admin')
    where resolved_at is null and created_at<=least(p_before,now());
  get diagnostics affected=row_count;
  return affected;
end $$;
revoke all on function public.super_admin_resolve_all_errors(timestamptz,text) from public,anon;
grant execute on function public.super_admin_resolve_all_errors(timestamptz,text) to authenticated;

-- Expired jobs are not retried by the worker; do not present their old errors as current configuration failures.
create or replace function public.super_admin_email_delivery_summary()
returns table(status text,total bigint,last_event_at timestamptz,last_error text)
language sql stable security definer set search_path='' as $$
  select case when o.created_at<=now()-interval '48 hours' then 'expired' else o.status end,
    count(*)::bigint,max(o.created_at),
    (array_agg(o.last_error order by o.updated_at desc) filter(where o.last_error is not null and o.created_at>now()-interval '48 hours'))[1]
  from public.notification_email_outbox o where public.is_super_admin()
  group by 1 order by 1
$$;
notify pgrst,'reload schema';
commit;
