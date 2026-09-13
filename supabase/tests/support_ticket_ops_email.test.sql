begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users(id,email,aud,role) values
('eb100000-0000-4000-8000-000000000001','owner-ticket-test@example.invalid','authenticated','authenticated'),
('eb100000-0000-4000-8000-000000000002','super-admin-ticket-test@example.invalid','authenticated','authenticated');
update public.profiles set is_super_admin=true where id='eb100000-0000-4000-8000-000000000002';
insert into public.companies(id,name) values ('eb200000-0000-4000-8000-000000000001','Ticket ops email test');
insert into public.roles(id,company_id,name,code) values ('eb300000-0000-4000-8000-000000000001','eb200000-0000-4000-8000-000000000001','Owner','company_admin');
insert into public.memberships(company_id,user_id,role_id) values ('eb200000-0000-4000-8000-000000000001','eb100000-0000-4000-8000-000000000001','eb300000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"eb100000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select public.create_support_ticket('eb200000-0000-4000-8000-000000000001','Paiement bloqué','Le paiement Orange Money ne passe pas depuis hier.','urgent');
reset role;

select is(
  (select count(*)::integer from public.notification_email_outbox where recipient_email='stockmaster.africa@gmail.com'),
  1,
  'exactly one email is queued to the shared operations inbox'
);
select ok(
  (select text_body from public.notification_email_outbox where recipient_email='stockmaster.africa@gmail.com') like '%Priorité : urgent%',
  'the queued email states the ticket priority'
);
select ok(
  (select subject from public.notification_email_outbox where recipient_email='stockmaster.africa@gmail.com') like '%URGENT%',
  'the subject line surfaces the priority so it is visible without opening the email'
);
select ok(
  (select text_body from public.notification_email_outbox where recipient_email='stockmaster.africa@gmail.com') like '%Paiement bloqué%',
  'the queued email includes the ticket subject'
);
select is(
  (select count(*)::integer from public.notification_email_outbox where recipient_email<>'stockmaster.africa@gmail.com' and notification_id in (select id from public.notifications where type='support_ticket_new')),
  1,
  'the Super Admin still separately receives their own copy at their registered email'
);
select is(
  (select recipient_user_id from public.notification_email_outbox where recipient_email='stockmaster.africa@gmail.com'),
  'eb100000-0000-4000-8000-000000000001'::uuid,
  'the ops-inbox row is keyed off the ticket creator, distinct from the admin''s own row, so neither conflicts and drops the other'
);

select * from finish();
rollback;
