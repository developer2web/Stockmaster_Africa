-- Repeated clicks must never restart or duplicate an active deletion request.

create or replace function public.request_account_deletion(p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid;
  v_status text;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;

  select id, status into v_id, v_status
  from public.account_deletion_requests
  where user_id = auth.uid()
  for update;

  if v_id is not null and v_status in ('pending', 'processing') then
    return v_id;
  end if;

  if v_id is not null then
    update public.account_deletion_requests
    set reason = nullif(trim(p_reason), ''),
        status = 'pending',
        requested_at = now(),
        processed_at = null,
        processed_by = null
    where id = v_id;
    return v_id;
  end if;

  insert into public.account_deletion_requests(user_id, reason, status)
  values(auth.uid(), nullif(trim(p_reason), ''), 'pending')
  returning id into v_id;
  return v_id;
end
$$;

grant execute on function public.request_account_deletion(text) to authenticated;
revoke all on function public.request_account_deletion(text) from anon;
