begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,aud,role) values
('e4100000-0000-4000-8000-000000000001','manual-owner@test.local','authenticated','authenticated'),
('e4100000-0000-4000-8000-000000000002','other-owner@test.local','authenticated','authenticated');
insert into public.companies(id,name,created_by) values
('e4200000-0000-4000-8000-000000000001','Manual payment fixture','e4100000-0000-4000-8000-000000000001'),
('e4200000-0000-4000-8000-000000000002','Other payment fixture','e4100000-0000-4000-8000-000000000002');
insert into public.client_businesses(client_id,company_id,is_primary,created_by) values
('e4100000-0000-4000-8000-000000000001','e4200000-0000-4000-8000-000000000001',true,'e4100000-0000-4000-8000-000000000001'),
('e4100000-0000-4000-8000-000000000002','e4200000-0000-4000-8000-000000000002',true,'e4100000-0000-4000-8000-000000000002');
insert into public.payment_transactions(id,client_id,company_id,plan_id,provider,provider_reference,operation_id,billing_cycle,amount,currency,status,request_details)
select 'e4300000-0000-4000-8000-000000000001','e4100000-0000-4000-8000-000000000001','e4200000-0000-4000-8000-000000000001',id,'orange_money_manual','OM-123456','e4400000-0000-4000-8000-000000000001','monthly',100,'GNF','succeeded','{"promoCode":null}' from public.plans where code='pro';
select set_config('test.payment_plan',(select id::text from public.plans where code='pro'),true);
select set_config('request.jwt.claims','{"sub":"e4100000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is(public.submit_manual_subscription_payment('e4200000-0000-4000-8000-000000000001',current_setting('test.payment_plan')::uuid,'monthly',' om- 123456 ',p_operation_id=>'e4400000-0000-4000-8000-000000000002'),'e4300000-0000-4000-8000-000000000001'::uuid,'a retry with new operation id and same normalized reference returns original payment');
select throws_ok($$select public.submit_manual_subscription_payment('e4200000-0000-4000-8000-000000000001',current_setting('test.payment_plan')::uuid,'annual','OM-123456')$$,'P0001',null,'same reference cannot be reused for a different billing cycle');
select throws_ok($$select public.submit_manual_subscription_payment('e4200000-0000-4000-8000-000000000001',current_setting('test.payment_plan')::uuid,'monthly','OM-123456',p_expected_amount=>200)$$,'P0001',null,'same reference cannot represent a different amount');
select set_config('request.jwt.claims','{"sub":"e4100000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
select throws_ok($$select public.submit_manual_subscription_payment('e4200000-0000-4000-8000-000000000002',current_setting('test.payment_plan')::uuid,'monthly','OM-123456')$$,'42501',null,'another owner cannot claim the same Orange Money reference');
reset role;
select is((select status from public.payment_transactions where id='e4300000-0000-4000-8000-000000000001'),'succeeded','retries preserve confirmed status');
select * from finish();
rollback;
