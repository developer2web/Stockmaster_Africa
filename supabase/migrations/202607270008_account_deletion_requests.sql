create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reason text,
  status text not null default 'pending' check(status in ('pending','processing','completed','rejected','cancelled')),
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid references public.profiles(id),
  unique(user_id)
);
alter table public.account_deletion_requests enable row level security;
create policy account_deletion_requests_select_own
on public.account_deletion_requests for select to authenticated
using(user_id=auth.uid() or public.is_super_admin());
create or replace function public.request_account_deletion(p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  insert into public.account_deletion_requests(user_id,reason,status,requested_at,processed_at,processed_by)
  values(auth.uid(),nullif(trim(p_reason),''),'pending',now(),null,null)
  on conflict(user_id) do update set
    reason=excluded.reason,
    status='pending',
    requested_at=now(),
    processed_at=null,
    processed_by=null
  returning id into v_id;
  return v_id;
end
$$;
grant execute on function public.request_account_deletion(text) to authenticated;
revoke all on function public.request_account_deletion(text) from anon;
grant select on public.account_deletion_requests to authenticated;
