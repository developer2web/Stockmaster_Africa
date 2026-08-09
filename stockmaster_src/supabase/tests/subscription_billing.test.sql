begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

select is((select count(*)::integer from plans where is_active),3,'three active plans exist');
select is((select max_businesses from plans where code='basic'),1,'Basic allows one business');
select is((select max_stores from plans where code='pro'),5,'Pro allows five stores');
select is((select max_employees from plans where code='pro'),15,'Pro allows fifteen employees');
select is((select ai_requests_limit from plans where code='pro'),0,'Removed AI allowance stays disabled');
select is(
  (select count(*)::integer from plan_features
   where feature_key in ('notifications','ai_summary','ai_assistant','offline_mode')),
  0,
  'Unavailable features are absent from every plan'
);
select isnt(
  (select is_enabled from plan_features pf join plans p on p.id=pf.plan_id
   where p.code='basic' and pf.feature_key='pdf_export'),
  true,
  'Basic disables PDF export'
);

insert into auth.users(id,email,aud,role)
values
  ('91000000-0000-4000-8000-000000000001','billing-a@test.local','authenticated','authenticated'),
  ('91000000-0000-4000-8000-000000000002','billing-b@test.local','authenticated','authenticated');

insert into companies(id,name,country_code,country_name,default_currency_code,created_by)
values
  ('92000000-0000-4000-8000-000000000001','Billing A','CA','Canada','CAD','91000000-0000-4000-8000-000000000001'),
  ('92000000-0000-4000-8000-000000000002','Billing B','CA','Canada','CAD','91000000-0000-4000-8000-000000000002');

insert into client_businesses(client_id,company_id,is_primary,created_by)
values
  ('91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',true,'91000000-0000-4000-8000-000000000001'),
  ('91000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000002',true,'91000000-0000-4000-8000-000000000002');

insert into stores(id,company_id,name,created_by)
values(
  '93000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001',
  'Billing Store',
  '91000000-0000-4000-8000-000000000001'
);

insert into subscriptions(company_id,client_id,plan_id,status,trial_ends_at,created_by)
values(
  '92000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  (select id from plans where code='basic'),
  'trialing',
  now()+interval '7 days',
  '91000000-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select ok(
  public.can_use_feature('92000000-0000-4000-8000-000000000001','sales'),
  'Basic allows sales'
);
select isnt(
  public.can_use_feature('92000000-0000-4000-8000-000000000001','expenses'),
  true,
  'Basic blocks expenses'
);
select throws_ok(
  $$insert into stores(company_id,name,created_by)
    values(
      '92000000-0000-4000-8000-000000000001',
      'Over limit',
      '91000000-0000-4000-8000-000000000001'
    )$$,
  'P0001',
  'Limite du forfait atteinte pour stores (1/1). Passez à un forfait supérieur.',
  'the Basic store limit is enforced by PostgreSQL'
);

select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
select is(
  (select count(*)::integer from subscriptions where client_id='91000000-0000-4000-8000-000000000001'),
  0,
  'another client cannot read the subscription'
);

reset role;
insert into payment_transactions(
  id,client_id,company_id,plan_id,provider,provider_reference,operation_id,
  billing_cycle,amount,currency,status
) values(
  '94000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001',
  (select id from plans where code='pro'),
  'sandbox',
  'provider-success-1',
  '95000000-0000-4000-8000-000000000001',
  'monthly',
  (select monthly_price from plans where code='pro'),
  'CAD',
  'processing'
);

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select lives_ok(
  $$select * from process_payment_webhook(
    'sandbox','provider-success-1','event-success-1','succeeded',
    (select monthly_price from plans where code='pro'),'CAD','{}'
  )$$,
  'a verified webhook activates the subscription'
);
select is(
  (select status::text from payment_transactions where id='94000000-0000-4000-8000-000000000001'),
  'succeeded',
  'the payment is marked succeeded'
);
select is(
  (select p.code from subscriptions s join plans p on p.id=s.plan_id
   where s.company_id='92000000-0000-4000-8000-000000000001'
     and s.status='active' order by s.created_at desc limit 1),
  'pro',
  'the paid Pro plan becomes active'
);
select lives_ok(
  $$select * from process_payment_webhook(
    'sandbox','provider-success-1','event-success-1','succeeded',
    (select monthly_price from plans where code='pro'),'CAD','{}'
  )$$,
  'a duplicate webhook is idempotent'
);

reset role;
insert into payment_transactions(
  id,client_id,company_id,plan_id,provider,provider_reference,operation_id,
  billing_cycle,amount,currency,status
)
select
  row.id,
  '91000000-0000-4000-8000-000000000001'::uuid,
  '92000000-0000-4000-8000-000000000001'::uuid,
  (select id from plans where code='pro'),
  'sandbox',
  row.reference,
  row.operation_id,
  'monthly',
  (select monthly_price from plans where code='pro'),
  'CAD',
  'processing'
from (
  values
    (
      '94000000-0000-4000-8000-000000000002'::uuid,
      'provider-invalid-1',
      '95000000-0000-4000-8000-000000000002'::uuid
    ),
    (
      '94000000-0000-4000-8000-000000000003'::uuid,
      'provider-cancelled-1',
      '95000000-0000-4000-8000-000000000003'::uuid
    ),
    (
      '94000000-0000-4000-8000-000000000004'::uuid,
      'provider-pending-1',
      '95000000-0000-4000-8000-000000000004'::uuid
    )
) as row(id,reference,operation_id);

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select throws_ok(
  $$select * from process_payment_webhook(
    'sandbox','provider-invalid-1','event-invalid-amount','succeeded',0.01,'CAD','{}'
  )$$,
  'P0001',
  'Montant de paiement incorrect',
  'a false payment amount is rejected'
);
select throws_ok(
  $$select * from process_payment_webhook(
    'sandbox','provider-invalid-1','event-invalid-currency','succeeded',
    (select monthly_price from plans where code='pro'),'USD','{}'
  )$$,
  'P0001',
  'Devise de paiement incorrecte',
  'a false payment currency is rejected'
);
select is(
  (select status from payment_transactions where provider_reference='provider-invalid-1'),
  'processing',
  'an invalid payment never activates'
);
select lives_ok(
  $$select * from process_payment_webhook(
    'sandbox','provider-cancelled-1','event-cancelled-1','cancelled',
    (select monthly_price from plans where code='pro'),'CAD','{}'
  )$$,
  'a cancelled payment webhook is recorded'
);
select is(
  (select status from payment_transactions where provider_reference='provider-cancelled-1'),
  'cancelled',
  'a cancelled payment remains cancelled'
);
select lives_ok(
  $$select * from process_payment_webhook(
    'sandbox','provider-pending-1','event-pending-1','processing',
    (select monthly_price from plans where code='pro'),'CAD','{}'
  )$$,
  'a pending payment webhook is recorded'
);
select is(
  (select status from payment_transactions where provider_reference='provider-pending-1'),
  'processing',
  'a pending payment does not activate'
);

select * from finish();
rollback;
