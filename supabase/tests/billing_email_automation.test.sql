begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Prevent all real network activity in fixtures, even with local webhook settings.
alter table public.notification_email_outbox disable trigger user;
select is((select enabled from private.billing_email_settings),false,'automation defaults to disabled');
select is(private.billing_reminder_kind('trialing',now()+interval '2 days',now()),'trial_ending','trial reminder window');
select is(private.billing_reminder_kind('active',now()+interval '6 days',now()),'ending_7d','seven-day window');
select is(private.billing_reminder_kind('active',now()+interval '12 hours',now()),'ending_1d','only the nearest reminder is selected');
select is(private.billing_reminder_kind('canceled',now(),now()),null,'canceled subscription is excluded');
select is(private.billing_reminder_kind('expired',now()-interval '2 days',now()),null,'old expirations are not backfilled');
select is(private.billing_reminder_kind('active',now()-interval '1 hour',now()),'expired','expiry reminder does not depend on status maintenance');
select ok(not has_function_privilege('authenticated','public.claim_notification_email_job(uuid,integer)','execute'),'users cannot claim other users email');
insert into auth.users(id,email,aud,role) values ('e5100000-0000-4000-8000-000000000001','billing-owner@test.local','authenticated','authenticated');
insert into public.companies(id,name,created_by) values ('e5200000-0000-4000-8000-000000000001','Billing fixture','e5100000-0000-4000-8000-000000000001');
insert into public.roles(id,company_id,name,code) values ('e5500000-0000-4000-8000-000000000001','e5200000-0000-4000-8000-000000000001','Owner','company_admin');
insert into public.memberships(company_id,user_id,role_id) values ('e5200000-0000-4000-8000-000000000001','e5100000-0000-4000-8000-000000000001','e5500000-0000-4000-8000-000000000001');
insert into public.subscriptions(id,company_id,plan_id,status,expires_at,starts_at)
select 'e5300000-0000-4000-8000-000000000001','e5200000-0000-4000-8000-000000000001',id,'active',now()+interval '6 days',now() from public.plans where code='pro';
update private.billing_email_settings set enabled=true,enabled_at=now();
insert into public.payment_transactions(id,client_id,company_id,plan_id,provider,operation_id,billing_cycle,amount,currency,status,subscription_id,confirmed_at)
select 'e5400000-0000-4000-8000-000000000001','e5100000-0000-4000-8000-000000000001','e5200000-0000-4000-8000-000000000001',id,'orange_money_manual','e5600000-0000-4000-8000-000000000001','monthly',22000,'GNF','succeeded','e5300000-0000-4000-8000-000000000001',now() from public.plans where code='pro';
select private.enqueue_billing_emails();
select private.enqueue_billing_emails();
select is((select count(*)::integer from private.billing_email_events where company_id='e5200000-0000-4000-8000-000000000001'),2,'one receipt and one reminder despite repeated scheduler runs');
select ok(exists(select 1 from public.notifications where company_id='e5200000-0000-4000-8000-000000000001' and type='subscription_payment_receipt' and body like '%22000%GNF%' and body like '%Fin de période%'),'receipt includes paid amount, currency and period');
-- A changed expiry invalidates the queued reminder before Resend is called.
update public.subscriptions set expires_at=now()+interval '30 days' where id='e5300000-0000-4000-8000-000000000001';
select is((select count(*)::integer from public.claim_notification_email_job((select o.id from public.notification_email_outbox o join private.billing_email_events e on e.notification_id=o.notification_id where e.company_id='e5200000-0000-4000-8000-000000000001' and e.kind='ending_7d' limit 1),0)),0,'extended subscription cancels queued reminder');
delete from public.notifications where company_id='e5200000-0000-4000-8000-000000000001';
select private.enqueue_billing_emails();
select is((select count(*)::integer from public.notifications where company_id='e5200000-0000-4000-8000-000000000001'),0,'purging notifications does not resend old receipts');
select set_config('request.jwt.claims','{"sub":"e5100000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select throws_ok($$select public.super_admin_billing_email_settings(true)$$,'42501',null,'a company owner cannot activate platform emails');
reset role;
select * from finish();
rollback;
