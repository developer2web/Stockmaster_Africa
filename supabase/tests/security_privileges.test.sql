begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id,email,aud,role) values
 ('91000000-0000-4000-8000-000000000001','security-owner-a@test.local','authenticated','authenticated'),
 ('91000000-0000-4000-8000-000000000002','security-employee-a@test.local','authenticated','authenticated'),
 ('91000000-0000-4000-8000-000000000003','security-owner-b@test.local','authenticated','authenticated'),
 ('91000000-0000-4000-8000-000000000004','security-platform@test.local','authenticated','authenticated');
-- Reuse a seeded platform administrator if one exists, respecting its limit.
update public.profiles set is_super_admin=true
where id='91000000-0000-4000-8000-000000000004'
  and not exists(select 1 from public.profiles where is_super_admin);

insert into public.companies(id,name,country_code,country_name,default_currency_code,created_by) values
 ('92000000-0000-4000-8000-000000000001','Security Company A','GN','Guinée','GNF','91000000-0000-4000-8000-000000000001'),
 ('92000000-0000-4000-8000-000000000002','Security Company B','GN','Guinée','GNF','91000000-0000-4000-8000-000000000003');
insert into public.client_businesses(client_id,company_id,is_primary,created_by) values
 ('91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',true,'91000000-0000-4000-8000-000000000001'),
 ('91000000-0000-4000-8000-000000000003','92000000-0000-4000-8000-000000000002',true,'91000000-0000-4000-8000-000000000003');
insert into public.subscriptions(company_id,plan_id,status,trial_ends_at,created_by)
select c.id,p.id,'trialing',now()+interval '1 day',c.created_by
from public.companies c cross join public.plans p
where c.id in ('92000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000002') and p.code='pro';
insert into public.stores(id,company_id,name,created_by) values
 ('93000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','Assigned A','91000000-0000-4000-8000-000000000001'),
 ('93000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000001','Unassigned A','91000000-0000-4000-8000-000000000001'),
 ('93000000-0000-4000-8000-000000000003','92000000-0000-4000-8000-000000000002','Store B','91000000-0000-4000-8000-000000000003');
insert into public.roles(id,company_id,name,code,created_by) values
 ('94000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','Owner A','company_admin','91000000-0000-4000-8000-000000000001'),
 ('94000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000001','Employee A','employee','91000000-0000-4000-8000-000000000001'),
 ('94000000-0000-4000-8000-000000000003','92000000-0000-4000-8000-000000000002','Owner B','company_admin','91000000-0000-4000-8000-000000000003');
insert into public.memberships(company_id,user_id,role_id,store_id,all_stores,created_by) values
 ('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',true,'91000000-0000-4000-8000-000000000001'),
 ('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','94000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000001',false,'91000000-0000-4000-8000-000000000001'),
 ('92000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000003','94000000-0000-4000-8000-000000000003','93000000-0000-4000-8000-000000000003',true,'91000000-0000-4000-8000-000000000003');
insert into public.role_permissions(company_id,role_id,permission_id,created_by)
select '92000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000002',id,'91000000-0000-4000-8000-000000000001'
from public.permissions where code='products.read';
insert into public.products(id,company_id,store_id,name,sku,purchase_price,sale_price,created_by) values
 ('95000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','Zero cost','SEC-A1',0,10,'91000000-0000-4000-8000-000000000001'),
 ('95000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000002','Unassigned product','SEC-A2',7,10,'91000000-0000-4000-8000-000000000001'),
 ('95000000-0000-4000-8000-000000000003','92000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000003','Other company product','SEC-B',9,10,'91000000-0000-4000-8000-000000000003');
insert into public.product_variants(id,company_id,product_id,name,sku,purchase_price,created_by) values
 ('96000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001','Inherited cost','SEC-V1',null,'91000000-0000-4000-8000-000000000001');
insert into public.sales(id,company_id,store_id,reference,total,cost_total,gross_profit,created_by) values
 ('97000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','SEC-SALE-A',10,4,6,'91000000-0000-4000-8000-000000000001');

select ok(not has_function_privilege('authenticated','public.get_internal_notifications(uuid)','EXECUTE'),'legacy financial alerts endpoint is closed');
select ok(not has_column_privilege('authenticated','public.profiles','is_super_admin','UPDATE'),'client cannot change platform privilege');
select ok(not has_column_privilege('authenticated','public.profiles','id','UPDATE'),'client cannot change profile identity');
select ok(has_column_privilege('authenticated','public.profiles','full_name','UPDATE'),'profile name remains editable');
select ok(has_column_privilege('authenticated','public.profiles','avatar_url','UPDATE'),'profile avatar remains editable');
select ok(not has_column_privilege('authenticated','public.products','purchase_price','SELECT'),'base product cost is private');
select ok(not has_column_privilege('authenticated','public.product_variants','purchase_price','SELECT'),'base variant cost is private');
select ok(not has_table_privilege('anon','public.product_costs','SELECT'),'anonymous product costs denied');
select ok(not has_table_privilege('anon','public.product_variant_costs','SELECT'),'anonymous variant costs denied');
select ok(not has_function_privilege('anon','public.get_lifetime_net_profit(uuid)','EXECUTE'),'anonymous financial totals denied');

set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
select throws_ok($$update public.profiles set is_super_admin=true where id=auth.uid()$$,'42501',null,'employee cannot self-promote');
select lives_ok($$update public.profiles set full_name='Updated employee',avatar_url='avatar.png' where id=auth.uid()$$,'employee can edit ordinary profile fields');
select is((select count(*)::integer from public.products where company_id='92000000-0000-4000-8000-000000000001'),1,'read-only employee sees assigned products');
select throws_ok($$select purchase_price from public.products$$,'42501',null,'direct product cost request denied');
select throws_ok($$select purchase_price from public.product_variants$$,'42501',null,'direct variant cost request denied');
select is((select count(*)::integer from public.product_costs where company_id='92000000-0000-4000-8000-000000000001'),0,'read-only employee sees no product costs');
select is((select count(*)::integer from public.product_variant_costs where company_id='92000000-0000-4000-8000-000000000001'),0,'read-only employee sees no variant costs');

reset role;
insert into public.role_permissions(company_id,role_id,permission_id,created_by)
select '92000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000002',id,'91000000-0000-4000-8000-000000000001'
from public.permissions where code='products.write';
set local role authenticated;
select is((select count(*)::integer from public.product_costs where company_id='92000000-0000-4000-8000-000000000001'),1,'product editor sees only assigned store cost');
select is((select purchase_price from public.product_costs where product_id='95000000-0000-4000-8000-000000000001'),0::numeric,'zero cost is preserved');
select is((select purchase_price from public.product_variant_costs where product_variant_id='96000000-0000-4000-8000-000000000001'),null::numeric,'variant inherited cost remains null');
select is((select count(*)::integer from public.product_costs where company_id='92000000-0000-4000-8000-000000000002'),0,'product editor cannot read another company cost');
select lives_ok($$update public.products set name='Edited safely' where id='95000000-0000-4000-8000-000000000001'$$,'safe product editing remains available');
select is((select count(*)::integer from public.sale_financials where sale_id='97000000-0000-4000-8000-000000000001'),0,'product editing does not grant historical sale profit');

select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select ok(public.is_company_admin('92000000-0000-4000-8000-000000000001'),'active company owner retains admin access');
select is((select count(*)::integer from public.product_costs where company_id='92000000-0000-4000-8000-000000000001'),2,'owner reads both store costs');
select is((select gross_profit from public.sale_financials where sale_id='97000000-0000-4000-8000-000000000001'),6::numeric,'owner retains historical financial view');
select is(public.get_lifetime_net_profit('93000000-0000-4000-8000-000000000001'),6::numeric,'owner retains financial total');
select lives_ok($$update public.products set purchase_price=2 where id='95000000-0000-4000-8000-000000000001'$$,'owner may update purchase price without direct read grant');

reset role;
update public.companies set is_active=false where id='92000000-0000-4000-8000-000000000001';
set local role authenticated;
select ok(not public.is_company_admin('92000000-0000-4000-8000-000000000001'),'disabled company cannot retain admin access');
select is((select count(*)::integer from public.sale_financials where company_id='92000000-0000-4000-8000-000000000001'),0,'disabled company financial view is closed');
select is((select count(*)::integer from public.product_costs where company_id='92000000-0000-4000-8000-000000000001'),0,'disabled company product costs are closed');
select throws_ok($$select public.get_lifetime_net_profit('93000000-0000-4000-8000-000000000001')$$,'P0001',null,'disabled company financial total is closed');
reset role;
update public.companies set is_active=true,plan_archived_at=now() where id='92000000-0000-4000-8000-000000000001';
set local role authenticated;
select ok(not public.is_company_admin('92000000-0000-4000-8000-000000000001'),'archived company cannot retain admin access');
select is((select count(*)::integer from public.sale_financials where company_id='92000000-0000-4000-8000-000000000001'),0,'archived company financial view is closed');
select throws_ok($$select public.get_lifetime_net_profit('93000000-0000-4000-8000-000000000001')$$,'P0001',null,'archived company financial total is closed');

reset role;
update public.companies set plan_archived_at=null where id='92000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where is_super_admin order by id limit 1),true);
set local role authenticated;
select ok(public.is_super_admin(),'fixture has platform privilege');
select ok(not public.is_company_admin('92000000-0000-4000-8000-000000000001'),'platform role does not imply company membership');
select is((select count(*)::integer from public.sale_financials where company_id='92000000-0000-4000-8000-000000000001'),0,'platform role has no implicit tenant financial access');
select is((select count(*)::integer from public.product_costs where company_id='92000000-0000-4000-8000-000000000001'),0,'platform role has no implicit product cost access');
select throws_ok($$select public.get_lifetime_net_profit('93000000-0000-4000-8000-000000000001')$$,'P0001',null,'platform role cannot use tenant financial total');

reset role;
-- Manager notifications: tenant/store isolation and revocation apply to old rows.
-- Both managers share a store so recipient isolation is tested independently
-- of store isolation. Raw product inserts above do not create stock levels.
insert into auth.users(id,email,aud,role)
values('91000000-0000-4000-8000-000000000005','security-manager-b@test.local','authenticated','authenticated');
insert into public.memberships(company_id,user_id,role_id,store_id,all_stores,created_by)
values('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000005','94000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000001',false,'91000000-0000-4000-8000-000000000001');
insert into public.role_permissions(company_id,role_id,permission_id,created_by)
select '92000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000002',id,'91000000-0000-4000-8000-000000000001'
from public.permissions where code in ('notifications.read','stock_movements.read') on conflict(role_id,permission_id) do nothing;
select is((select count(*)::integer from public.stock_levels where product_id='95000000-0000-4000-8000-000000000001'),0,'fixture has no automatic or duplicate stock level');
insert into public.stock_levels(company_id,store_id,product_id,quantity,created_by)
values('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001',0,'91000000-0000-4000-8000-000000000001');
update public.stock_levels set quantity=0 where product_id='95000000-0000-4000-8000-000000000001';
select is((select count(*)::integer from public.notifications where company_id='92000000-0000-4000-8000-000000000001' and store_id='93000000-0000-4000-8000-000000000001' and type='low_stock' and user_id is not null),2,'one stock crossing creates exactly one alert per manager without duplicates');
insert into public.notifications(id,company_id,store_id,user_id,title,body,type,email_enabled) values
 ('98000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000002','Hidden store','Fixture','low_stock',false),
 ('98000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000001',null,'91000000-0000-4000-8000-000000000002','Hidden payment','Fixture','subscription_payment_succeeded',false),
 ('98000000-0000-4000-8000-000000000003','92000000-0000-4000-8000-000000000001',null,'91000000-0000-4000-8000-000000000002','Personal message A','Fixture','message',false),
 ('98000000-0000-4000-8000-000000000004','92000000-0000-4000-8000-000000000001',null,'91000000-0000-4000-8000-000000000005','Personal message B','Fixture','message',false),
 ('98000000-0000-4000-8000-000000000005','92000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000002','Hidden company','Fixture','low_stock',false);
select is((select count(*)::integer from public.notification_email_outbox o join public.notifications n on n.id=o.notification_id where n.user_id in ('91000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000005') and n.type='low_stock'),0,'new manager stock notifications do not send emails');
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is((select count(*)::integer from public.notifications where type='low_stock'),1,'manager sees only their assigned-store alert');
select is((select count(*)::integer from public.notifications where user_id='91000000-0000-4000-8000-000000000005'),0,'manager cannot read another recipient even in the same store');
select is((select count(*)::integer from public.notifications where type='subscription_payment_succeeded'),0,'manager does not inherit subscription payment notices');
select is((with marked as (update public.notifications set read_at=now() where type='low_stock' returning id) select count(*)::integer from marked),1,'manager actually marks exactly their own alert read');
select is((select count(*)::integer from public.notifications where type='low_stock' and read_at=now()),1,'manager read timestamp is saved');
reset role;
select is((select count(*)::integer from public.notifications where user_id is null and type='low_stock' and read_at is null and company_id='92000000-0000-4000-8000-000000000001'),1,'manager read status does not change owner notice');
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000005',true);
set local role authenticated;
select is((select count(*)::integer from public.notifications where type='low_stock' and read_at is null),1,'second manager keeps their own unread stock alert');
select is((select count(*)::integer from public.notifications where user_id='91000000-0000-4000-8000-000000000002'),0,'second manager cannot read first manager messages');
reset role;
delete from public.role_permissions where role_id='94000000-0000-4000-8000-000000000002' and permission_id in(select id from public.permissions where code='notifications.read');
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is((select count(*)::integer from public.notifications where type='low_stock'),0,'revoking manager permission closes existing alerts');
select is((select count(*)::integer from public.notifications where type='message'),1,'active employee retains their personal message without notifications.read');
select is((with marked as (update public.notifications set read_at=now() where type='message' returning id) select count(*)::integer from marked),1,'employee without manager permission can mark their personal message read');
select is((select count(*)::integer from public.notifications where type='subscription_payment_succeeded'),0,'personal inbox without manager permission still excludes subscription notices');
reset role;
insert into public.role_permissions(company_id,role_id,permission_id,created_by)
select '92000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000002',id,'91000000-0000-4000-8000-000000000001'
from public.permissions where code='notifications.read';
delete from public.role_permissions where role_id='94000000-0000-4000-8000-000000000002' and permission_id in(select id from public.permissions where code in ('stock_movements.read','stock_movements.write'));
set local role authenticated;
select is((select count(*)::integer from public.notifications where type='low_stock'),0,'revoking stock permission also closes existing manager alerts');
reset role;
insert into public.role_permissions(company_id,role_id,permission_id,created_by)
select '92000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000002',id,'91000000-0000-4000-8000-000000000001'
from public.permissions where code='stock_movements.read';
delete from public.membership_stores where membership_id in(select id from public.memberships where user_id='91000000-0000-4000-8000-000000000002' and company_id='92000000-0000-4000-8000-000000000001');
update public.memberships set store_id=null,all_stores=false where user_id='91000000-0000-4000-8000-000000000002' and company_id='92000000-0000-4000-8000-000000000001';
set local role authenticated;
select is((select count(*)::integer from public.notifications where type='low_stock'),0,'removing assigned stores closes existing alerts');
select is((with marked as (update public.notifications set read_at=null where type='low_stock' returning id) select count(*)::integer from marked),0,'removed store alerts cannot be changed either');
select is((select count(*)::integer from public.notifications where type='message'),1,'store revocation preserves active employee personal messages');
reset role;
update public.memberships set store_id='93000000-0000-4000-8000-000000000001' where user_id='91000000-0000-4000-8000-000000000002' and company_id='92000000-0000-4000-8000-000000000001';
set local role authenticated;
select is((select count(*)::integer from public.notifications where type='low_stock'),1,'restoring the assigned store makes its existing alert readable');
reset role;
update public.memberships set is_active=false where user_id='91000000-0000-4000-8000-000000000002' and company_id='92000000-0000-4000-8000-000000000001';
set local role authenticated;
select is((select count(*)::integer from public.notifications where type in ('message','low_stock')),0,'deactivated employee loses both business alerts and old personal messages');
select is((with marked as (update public.notifications set read_at=null where type='message' returning id) select count(*)::integer from marked),0,'deactivated employee cannot change old personal messages');
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000005',true);
select is((select count(*)::integer from public.notifications where type='low_stock'),1,'deactivating one manager does not affect the other recipient');
select is((select count(*)::integer from public.notifications where type='message' and read_at is null),1,'other recipient personal message remains unchanged');
reset role;
select * from finish();
rollback;
