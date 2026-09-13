begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users(id,email,aud,role) values
('ec100000-0000-4000-8000-000000000001','owner-deletion-test@example.invalid','authenticated','authenticated'),
('ec100000-0000-4000-8000-000000000002','super-admin-deletion-test@example.invalid','authenticated','authenticated');
update public.profiles set is_super_admin=true where id='ec100000-0000-4000-8000-000000000002';

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ec100000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select public.request_account_deletion('Je ferme ma boutique');

select is(
  (select status from public.account_deletion_requests where user_id='ec100000-0000-4000-8000-000000000001'),
  'pending', 'a fresh request starts pending'
);
select throws_ok(
  $$select public.super_admin_account_deletion_requests()$$, '42501', null,
  'an ordinary owner cannot list deletion requests'
);
select throws_ok(
  $$select public.super_admin_update_account_deletion_request((select id from public.account_deletion_requests limit 1),'completed')$$,
  '42501', null, 'an ordinary owner cannot process deletion requests'
);

select set_config('request.jwt.claims','{"sub":"ec100000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
select is(
  (select count(*)::integer from public.super_admin_account_deletion_requests() where email='owner-deletion-test@example.invalid'),
  1, 'the Super Admin sees the pending request with the requester''s email'
);
select public.super_admin_update_account_deletion_request(
  (select id from public.account_deletion_requests where user_id='ec100000-0000-4000-8000-000000000001'),
  'processing'
);
select is(
  (select status from public.account_deletion_requests where user_id='ec100000-0000-4000-8000-000000000001'),
  'processing', 'the Super Admin can move a request to processing'
);
select public.super_admin_update_account_deletion_request(
  (select id from public.account_deletion_requests where user_id='ec100000-0000-4000-8000-000000000001'),
  'completed'
);
select ok(
  (select processed_at is not null and processed_by='ec100000-0000-4000-8000-000000000002' from public.account_deletion_requests where user_id='ec100000-0000-4000-8000-000000000001'),
  'completing a request stamps who processed it and when'
);
select throws_ok(
  $$select public.super_admin_update_account_deletion_request(gen_random_uuid(),'completed')$$,
  null, 'Demande introuvable', 'an unknown request id is rejected explicitly'
);

reset role;
select * from finish();
rollback;
