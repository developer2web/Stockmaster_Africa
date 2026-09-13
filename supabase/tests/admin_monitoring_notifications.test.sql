begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
alter table public.notifications disable trigger user;
insert into auth.users(id,email,aud,role) values
('ea100000-0000-4000-8000-000000000001','owner-admin-test@example.invalid','authenticated','authenticated'),
('ea100000-0000-4000-8000-000000000002','employee-admin-test@example.invalid','authenticated','authenticated');
insert into public.companies(id,name) values ('ea200000-0000-4000-8000-000000000001','Notification test'),('ea200000-0000-4000-8000-000000000002','Other company');
insert into public.roles(id,company_id,name,code) values ('ea300000-0000-4000-8000-000000000001','ea200000-0000-4000-8000-000000000001','Owner','company_admin');
insert into public.memberships(company_id,user_id,role_id) values ('ea200000-0000-4000-8000-000000000001','ea100000-0000-4000-8000-000000000001','ea300000-0000-4000-8000-000000000001');
insert into public.notifications(company_id,user_id,title,body,type,created_at) values
('ea200000-0000-4000-8000-000000000001','ea100000-0000-4000-8000-000000000001','Personal','Test','test',now()),
('ea200000-0000-4000-8000-000000000001','ea100000-0000-4000-8000-000000000002','Other personal','Test','test',now()),
('ea200000-0000-4000-8000-000000000001',null,'Shared','Test','test',now()),
('ea200000-0000-4000-8000-000000000001','ea100000-0000-4000-8000-000000000001','Expired','Test','test',now()-interval '3 days'),
('ea200000-0000-4000-8000-000000000002',null,'Other tenant','Test','test',now());
select set_config('request.jwt.claims','{"sub":"ea100000-0000-4000-8000-000000000002","aal":"aal1"}',true);
select is(cardinality(public.mark_notifications_read('ea200000-0000-4000-8000-000000000001')),1,'employee marks only their personal notification');
select is((select count(*)::integer from public.notifications where title='Shared' and read_at is null),1,'employee cannot mark shared notification');
select set_config('request.jwt.claims','{"sub":"ea100000-0000-4000-8000-000000000001","aal":"aal1"}',true);
select is(cardinality(public.mark_notifications_read('ea200000-0000-4000-8000-000000000001')),2,'owner marks own and shared notifications');
select is(cardinality(public.mark_notifications_read('ea200000-0000-4000-8000-000000000001')),0,'repeat action has no effect');
select is(cardinality(public.mark_notifications_read('ea200000-0000-4000-8000-000000000002')),0,'cannot change another tenant');
select is((select count(*)::integer from public.notifications where title='Expired' and read_at is null),1,'expired notifications are untouched');
select throws_ok($$select public.super_admin_resolve_all_errors()$$,'42501',null,'owner cannot resolve platform incidents');
select ok(not has_function_privilege('anon','public.mark_notifications_read(uuid)','execute'),'anonymous role cannot mark notifications');
select set_config('request.jwt.claims','{}',true);
select throws_ok($$select public.mark_notifications_read('ea200000-0000-4000-8000-000000000001')$$,'42501',null,'missing session is rejected');
select * from finish();
rollback;
