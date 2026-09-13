begin;
insert into auth.users(id,email) values('ee100000-0000-4000-8000-000000000001','expired-employee@example.invalid');
insert into public.companies(id,name) values('ee200000-0000-4000-8000-000000000001','Employee read access');
insert into public.roles(id,company_id,code) values('ee300000-0000-4000-8000-000000000001','ee200000-0000-4000-8000-000000000001','manager');
insert into public.memberships(company_id,user_id,role_id) values('ee200000-0000-4000-8000-000000000001','ee100000-0000-4000-8000-000000000001','ee300000-0000-4000-8000-000000000001');
insert into public.permissions(id,code) values('ee400000-0000-4000-8000-000000000001','products.write');
insert into public.role_permissions(role_id,permission_id) values('ee300000-0000-4000-8000-000000000001','ee400000-0000-4000-8000-000000000001');
insert into public.subscriptions(id,company_id,plan_id,status,expires_at)
select gen_random_uuid(),'ee200000-0000-4000-8000-000000000001',id,'expired',now()-interval '1 day' from public.plans limit 1;
select set_config('request.jwt.claims','{"sub":"ee100000-0000-4000-8000-000000000001"}',true);
select public.ok(public.can_read_product_cost('ee200000-0000-4000-8000-000000000001',null),'expired manager retains assigned cost read access');
select public.ok(not public.has_permission('ee200000-0000-4000-8000-000000000001','products.write'),'cost read does not restore product writes');
select public.ok(not public.can_read_product_cost(gen_random_uuid(),null),'no other company cost access');
select set_config('request.jwt.claims','{}',true);
update public.memberships set is_active=false where user_id='ee100000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims','{"sub":"ee100000-0000-4000-8000-000000000001"}',true);
select public.ok(not public.can_read_product_cost('ee200000-0000-4000-8000-000000000001',null),'revocation still removes financial read access');
rollback;
