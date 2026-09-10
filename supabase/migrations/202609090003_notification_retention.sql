-- Notifications expire 48 hours after creation, read or unread.
-- Keep recipient isolation and leave security/business history untouched.
create index if not exists notifications_created_at_retention_idx on public.notifications(created_at);

drop policy if exists notifications_recipient_select on public.notifications;
create policy notifications_recipient_select on public.notifications
for select to authenticated using (
  created_at > now() - interval '48 hours'
  and (user_id=auth.uid() or (user_id is null and public.belongs_to_company(company_id)))
);

create or replace function private.purge_expired_notifications()
returns bigint language plpgsql security definer set search_path='' as $$
declare removed bigint;
begin
  delete from public.notifications where created_at <= now() - interval '48 hours';
  get diagnostics removed = row_count;
  return removed;
end;
$$;
revoke all on function private.purge_expired_notifications() from public,anon,authenticated;

-- The existing email outbox FK cascades when its notification expires.
-- pg_cron is already installed by the notification email migration.
do $$
declare existing_job bigint;
begin
  for existing_job in select jobid from cron.job where jobname='stockmaster-notification-retention'
  loop perform cron.unschedule(existing_job); end loop;
  perform cron.schedule('stockmaster-notification-retention','* * * * *',
    'select private.purge_expired_notifications()');
end;
$$;
select private.purge_expired_notifications();
