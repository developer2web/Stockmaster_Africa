begin;
-- Account deletion requests could be created (request_account_deletion,
-- 202607270008) but nothing let a Super Admin see or act on them. This adds
-- the missing read + status-update path. It intentionally does not erase or
-- anonymize any data by itself — that still needs an explicit retention
-- policy (see docs/LEGAL_RELEASE_CHECKLIST.md) before being automated.
create or replace function public.super_admin_account_deletion_requests()
returns table(
  id uuid, user_id uuid, full_name text, email text, reason text,
  status text, requested_at timestamptz, processed_at timestamptz, processed_by_name text
)
language sql stable security definer set search_path=public as $$
  select r.id, r.user_id, coalesce(p.full_name,''), u.email::text, r.reason,
    r.status, r.requested_at, r.processed_at, pb.full_name
  from public.account_deletion_requests r
  join public.profiles p on p.id=r.user_id
  join auth.users u on u.id=r.user_id
  left join public.profiles pb on pb.id=r.processed_by
  where public.is_super_admin()
  order by case r.status when 'pending' then 0 when 'processing' then 1 else 2 end, r.requested_at desc
$$;
grant execute on function public.super_admin_account_deletion_requests() to authenticated;
revoke all on function public.super_admin_account_deletion_requests() from anon;

create or replace function public.super_admin_update_account_deletion_request(
  p_request_id uuid, p_status text, p_note text default null
) returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_super_admin() then raise exception 'Accès Super Admin requis' using errcode='42501'; end if;
  perform public.assert_session_security(false);
  if p_status not in ('pending','processing','completed','rejected','cancelled') then
    raise exception 'Statut invalide';
  end if;
  update public.account_deletion_requests set
    status=p_status,
    processed_at=case when p_status='pending' then null else now() end,
    processed_by=case when p_status='pending' then null else auth.uid() end
  where id=p_request_id;
  if not found then raise exception 'Demande introuvable'; end if;
end $$;
grant execute on function public.super_admin_update_account_deletion_request(uuid,text,text) to authenticated;
revoke all on function public.super_admin_update_account_deletion_request(uuid,text,text) from anon;
notify pgrst,'reload schema';
commit;
