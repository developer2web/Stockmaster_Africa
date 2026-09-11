begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,aud,role) values('e5000000-0000-4000-8000-000000000001','incident-fixture@test.local','authenticated','authenticated');
update public.profiles set is_super_admin=true where id='e5000000-0000-4000-8000-000000000001' and not exists(select 1 from public.profiles where is_super_admin);
select set_config('test.incident_admin',(select id::text from public.profiles where is_super_admin order by id limit 1),true);
insert into public.app_error_events(user_id,severity,code,message,created_at) values
('e5000000-0000-4000-8000-000000000001','error','incident-test','old fixture',now()-interval '1 hour'),
('e5000000-0000-4000-8000-000000000001','error','incident-test','new fixture',now());
select set_config('request.jwt.claims','{"role":"authenticated","aal":"aal2"}',true);
select set_config('request.jwt.claim.sub',current_setting('test.incident_admin'),true);
set local role authenticated;
select lives_ok($$select public.super_admin_resolve_all_errors(now()-interval '1 minute','Reviewed fixture')$$,'Super Admin can resolve older open errors in one operation');
select is((select count(*)::integer from public.app_error_events where code='incident-test' and resolved_at is not null),1,'bulk resolution respects the confirmation cutoff');
select is((select count(*)::integer from public.app_error_events where code='incident-test'),2,'resolution keeps incident history');
select is(public.super_admin_resolve_all_errors(now()-interval '1 minute','Repeat fixture'),0,'bulk resolution is idempotent');
reset role;
select set_config('request.jwt.claim.sub','e5000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok($$select public.super_admin_resolve_all_errors()$$,'42501',null,'non-administrators cannot resolve incidents');
reset role;
select * from finish();
rollback;
