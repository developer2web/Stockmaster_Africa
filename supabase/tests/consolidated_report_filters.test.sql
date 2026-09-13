begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users(id,email,aud,role) values
('ed100000-0000-4000-8000-000000000001','owner-consolidated-test@example.invalid','authenticated','authenticated'),
('ed100000-0000-4000-8000-000000000002','employee-consolidated-test@example.invalid','authenticated','authenticated');
insert into public.companies(id,name) values ('ed200000-0000-4000-8000-000000000001','Consolidated report test');
insert into public.stores(id,company_id,name) values
('ed300000-0000-4000-8000-000000000001','ed200000-0000-4000-8000-000000000001','Boutique A'),
('ed300000-0000-4000-8000-000000000002','ed200000-0000-4000-8000-000000000001','Boutique B');
insert into public.roles(id,company_id,name,code) values
('ed400000-0000-4000-8000-000000000001','ed200000-0000-4000-8000-000000000001','Owner','company_admin'),
('ed400000-0000-4000-8000-000000000002','ed200000-0000-4000-8000-000000000001','Employé','employee');
insert into public.role_permissions(role_id,permission_id) select 'ed400000-0000-4000-8000-000000000002',id from public.permissions where code='daily_reports.read';
insert into public.memberships(company_id,user_id,role_id,all_stores) values
('ed200000-0000-4000-8000-000000000001','ed100000-0000-4000-8000-000000000001','ed400000-0000-4000-8000-000000000001',true);
insert into public.memberships(company_id,user_id,role_id,store_id) values
('ed200000-0000-4000-8000-000000000001','ed100000-0000-4000-8000-000000000002','ed400000-0000-4000-8000-000000000002','ed300000-0000-4000-8000-000000000001');
insert into public.categories(company_id,store_id,name) values
('ed200000-0000-4000-8000-000000000001','ed300000-0000-4000-8000-000000000001','Cat A'),
('ed200000-0000-4000-8000-000000000001','ed300000-0000-4000-8000-000000000002','Cat B');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ed100000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);

select is(
  (select count(*)::integer from jsonb_array_elements(public.get_report_filters('ed300000-0000-4000-8000-000000000001'::uuid,null))),
  1, 'a specific store still returns exactly that store when only p_store_id is given'
);
select is(
  (select jsonb_array_length(public.get_report_filters(null,'ed200000-0000-4000-8000-000000000001'::uuid)->'stores')),
  2, 'a null store with the company id returns every store of that company'
);
select is(
  (select jsonb_array_length(public.get_report_filters(null,'ed200000-0000-4000-8000-000000000001'::uuid)->'categories')),
  2, 'the consolidated view aggregates categories across every store'
);

select set_config('request.jwt.claims','{"sub":"ed100000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
select throws_ok(
  $$select public.get_report_filters(null,'ed200000-0000-4000-8000-000000000001'::uuid)$$,
  null, 'Accès aux rapports refusé', 'an employee (not company_admin) cannot request the company-wide view'
);
select is(
  (select jsonb_array_length(public.get_report_filters('ed300000-0000-4000-8000-000000000001'::uuid,null)->'stores')),
  1, 'an employee can still read filters scoped to their own assigned store'
);

reset role;
select is(
  (select count(*)::integer from pg_proc where proname='get_report_filters' and pronargs=1),
  0, 'the old single-argument overload was dropped, not left ambiguous alongside the new one'
);

select * from finish();
rollback;
