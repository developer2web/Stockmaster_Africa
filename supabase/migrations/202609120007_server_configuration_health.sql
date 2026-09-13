begin;
-- Retention previously existed only in local sources. Preserve current recipient policies.
create index if not exists notifications_created_at_retention_idx on public.notifications(created_at);
create or replace function private.purge_expired_notifications()
returns bigint language plpgsql security definer set search_path='' as $$
declare removed bigint;
begin
 delete from public.notifications where created_at <= now()-interval '48 hours';
 get diagnostics removed=row_count;
 return removed;
end $$;
revoke all on function private.purge_expired_notifications() from public,anon,authenticated;
select cron.schedule('stockmaster-notification-retention','* * * * *','select private.purge_expired_notifications()');

create or replace function public.super_admin_server_health()
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 -- Reuse the deployed Super Admin + MFA + account-state guard, without changing settings.
 perform public.super_admin_billing_email_settings();
 select jsonb_build_object(
  'checkedAt',now(),
  'readOnlyEnforced',exists(select 1 from pg_trigger where tgrelid='public.companies'::regclass and tgname='guard_expired_business_write' and tgenabled='O'),
  'functions', (select jsonb_agg(jsonb_build_object('name',name,'available',to_regprocedure(signature) is not null)) from (values
    ('Historique des ventes','public.get_filtered_sales_history(uuid,uuid,integer,integer,text,timestamp with time zone,timestamp with time zone,text,text)'),
    ('Déclaration Orange Money','public.submit_manual_subscription_payment(uuid,uuid,text,text,text,text,uuid,uuid,numeric,text)'),
    ('Sécurité de session','public.assert_session_security(boolean)'),
    ('Verrouillage du paiement','public.claim_payment_provider_request(uuid)'),
    ('Notifications lues','public.mark_notifications_read(uuid)')
   ) required(name,signature)),
  'jobs',(select jsonb_agg(jsonb_build_object('name',expected.name,'active',coalesce(j.active,false),
    'lastStatus',(select d.status from cron.job_run_details d where d.jobid=j.jobid order by d.start_time desc limit 1)))
    from (values ('stockmaster-billing-emails'),('stockmaster-notification-email-retry'),('stockmaster-notification-retention')) expected(name)
    left join cron.job j on j.jobname=expected.name)
 ) into result;
 return result;
end $$;
revoke all on function public.super_admin_server_health() from public,anon;
grant execute on function public.super_admin_server_health() to authenticated;
notify pgrst,'reload schema';
commit;
