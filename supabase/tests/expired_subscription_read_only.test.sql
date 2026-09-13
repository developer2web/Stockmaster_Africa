begin;
insert into auth.users(id,email) values('ec100000-0000-4000-8000-000000000001','readonly@example.invalid');
insert into public.companies(id,name) values('ec200000-0000-4000-8000-000000000001','Read only company');
insert into public.roles(id,company_id,code) values('ec300000-0000-4000-8000-000000000001','ec200000-0000-4000-8000-000000000001','company_admin');
insert into public.memberships(company_id,user_id,role_id) values('ec200000-0000-4000-8000-000000000001','ec100000-0000-4000-8000-000000000001','ec300000-0000-4000-8000-000000000001');
insert into public.subscriptions(id,company_id,plan_id,status,expires_at,created_at)
select 'ec400000-0000-4000-8000-000000000001','ec200000-0000-4000-8000-000000000001',id,'active',now()+interval '10 days',now()-interval '1 day' from public.plans limit 1;
insert into public.products values('ec500000-0000-4000-8000-000000000001','ec200000-0000-4000-8000-000000000001',null,100);
select set_config('request.jwt.claims','{"sub":"ec100000-0000-4000-8000-000000000001"}',true);
select public.ok(public.has_permission('ec200000-0000-4000-8000-000000000001','sales.write'),'active subscription permits business writes');
update public.products set purchase_price=110 where id='ec500000-0000-4000-8000-000000000001';
-- Latest expired subscription must win over an older active record.
insert into public.subscriptions(id,company_id,plan_id,status,expires_at,grace_period_ends_at)
select 'ec400000-0000-4000-8000-000000000002','ec200000-0000-4000-8000-000000000001',id,'past_due',now()-interval '1 hour',now()+interval '3 days' from public.plans limit 1;
select public.ok(not public.has_active_subscription('ec200000-0000-4000-8000-000000000001'),'latest expiry blocks writes despite grace or older active row');
select public.ok(public.has_permission('ec200000-0000-4000-8000-000000000001','sales.read'),'owner retains read permission');
select public.ok(not public.has_permission('ec200000-0000-4000-8000-000000000001','sales.write'),'owner loses write permission');
select public.ok((select is_read_only from public.current_subscription('ec200000-0000-4000-8000-000000000001')),'subscription API reports read only');
select public.throws_ok($$update public.products set purchase_price=120$$,'42501',null,'direct update blocked');
select public.throws_ok($$delete from public.products$$,'42501',null,'direct delete blocked');
select public.throws_ok($$insert into public.products values(gen_random_uuid(),'ec200000-0000-4000-8000-000000000001',null,10)$$,'42501',null,'direct insert blocked');
select public.throws_ok($$update public.companies set name='Changed'$$,'42501',null,'company edits blocked');
select public.is((select count(*)::integer from public.product_costs),1,'expired owner still sees existing costs');
-- Billing tables remain usable so an expired owner can submit a renewal declaration.
insert into public.payment_transactions(id,company_id,client_id,provider,status) values(gen_random_uuid(),'ec200000-0000-4000-8000-000000000001','ec100000-0000-4000-8000-000000000001','orange_money','processing');
select public.ok(true,'renewal payment remains writable under existing authorization');
update public.profiles set is_super_admin=true where id=auth.uid();
update public.products set purchase_price=120;
select public.is((select purchase_price from public.products limit 1),120::numeric,'super admin maintenance unaffected');
rollback;
