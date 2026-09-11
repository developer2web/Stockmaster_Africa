begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,aud,role)
values('e3000000-0000-4000-8000-000000000001','payment-integrity@test.local','authenticated','authenticated');
insert into public.companies(id,name,created_by)
values('e3000000-0000-4000-8000-000000000002','Payment security fixture','e3000000-0000-4000-8000-000000000001');
insert into public.payment_transactions(id,client_id,company_id,plan_id,provider,operation_id,billing_cycle,amount,currency,status,created_at)
select fixture.id::uuid,'e3000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000002',p.id,fixture.provider,fixture.id::uuid,'monthly',100,'GNF','pending',fixture.created_at
from public.plans p cross join (values
 ('e3100000-0000-4000-8000-000000000001','stripe',now()),
 ('e3100000-0000-4000-8000-000000000002','orange_money',now()),
 ('e3100000-0000-4000-8000-000000000003','stripe',now()-interval '25 hours')
) as fixture(id,provider,created_at) where p.code='pro';

select ok(not has_function_privilege('authenticated','public.claim_payment_provider_request(uuid)','EXECUTE'),'clients cannot claim provider requests');
select ok(not has_function_privilege('anon','public.release_payment_provider_request(uuid)','EXECUTE'),'anonymous users cannot release provider requests');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
select ok(public.claim_payment_provider_request('e3100000-0000-4000-8000-000000000001'),'first Stripe request is claimed');
select ok(not public.claim_payment_provider_request('e3100000-0000-4000-8000-000000000001'),'concurrent Stripe request cannot claim active lease');
select ok(public.claim_payment_provider_request('e3100000-0000-4000-8000-000000000002'),'first Mobile Money request is claimed');
select ok(public.claim_payment_provider_request('e3100000-0000-4000-8000-000000000003'),'old unsent Stripe operation can start once');
reset role;
update public.payment_transactions set provider_request_started_at=now()-interval '6 minutes'
where id in ('e3100000-0000-4000-8000-000000000001','e3100000-0000-4000-8000-000000000002','e3100000-0000-4000-8000-000000000003');
set local role service_role;
select ok(public.claim_payment_provider_request('e3100000-0000-4000-8000-000000000001'),'Stripe can reuse its idempotency key within the safe window');
select ok(not public.claim_payment_provider_request('e3100000-0000-4000-8000-000000000002'),'uncertain Mobile Money operation is never sent again automatically');
select ok(not public.claim_payment_provider_request('e3100000-0000-4000-8000-000000000003'),'Stripe cannot retry after the idempotency retention window');
reset role;
select throws_ok($$update public.payment_transactions set amount=200 where id='e3100000-0000-4000-8000-000000000001'$$,'23514',null,'reserved amount is immutable');
select lives_ok($$update public.payment_transactions set status='processing',provider_reference='cs_fixture_integrity' where id='e3100000-0000-4000-8000-000000000001'$$,'provider acknowledgement can mark processing');
select throws_ok($$update public.payment_transactions set provider_reference='other' where id='e3100000-0000-4000-8000-000000000001'$$,'23514',null,'provider reference cannot be replaced');
select lives_ok($$update public.payment_transactions set status='succeeded',confirmed_at=now() where id='e3100000-0000-4000-8000-000000000001'$$,'confirmation from processing remains available');
select throws_ok($$update public.payment_transactions set status='pending' where id='e3100000-0000-4000-8000-000000000001'$$,'23514',null,'confirmed payment cannot be reset by retry');
select throws_ok($$update public.payment_transactions set confirmed_at=null where id='e3100000-0000-4000-8000-000000000001'$$,'23514',null,'confirmation timestamp is preserved');
select lives_ok($$update public.payment_transactions set archived_at=now(),archive_reason='Security fixture' where id='e3100000-0000-4000-8000-000000000001'$$,'archiving a confirmed payment remains available');
select lives_ok($$update public.payment_transactions set status='failed' where id='e3100000-0000-4000-8000-000000000002'$$,'pending payment can be refused');
select throws_ok($$update public.payment_transactions set status='succeeded' where id='e3100000-0000-4000-8000-000000000002'$$,'23514',null,'a late provider event cannot reopen a refused operation');
select * from finish();
rollback;
