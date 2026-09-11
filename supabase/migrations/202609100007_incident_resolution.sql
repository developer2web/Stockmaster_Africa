begin;
create or replace function public.super_admin_resolve_all_errors(p_before timestamptz default now(),p_note text default null)
returns integer language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
  if not public.is_super_admin() then raise exception 'Accès Super Admin requis' using errcode='42501';end if;
  perform public.assert_session_security(false);
  if p_before is null then raise exception 'Date de résolution requise';end if;
  update public.app_error_events set resolved_at=now(),resolved_by=auth.uid(),
    resolution_note=coalesce(nullif(left(trim(coalesce(p_note,'')),500),''),'Résolution groupée par le Super Admin')
  where resolved_at is null and created_at<=least(p_before,now());
  get diagnostics affected=row_count;
  return affected;
end $$;
revoke all on function public.super_admin_resolve_all_errors(timestamptz,text) from public,anon;
grant execute on function public.super_admin_resolve_all_errors(timestamptz,text) to authenticated;
notify pgrst,'reload schema';
commit;
