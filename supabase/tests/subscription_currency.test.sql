begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users(id,email,aud,role)
values('97000000-0000-4000-8000-000000000001','currency-owner@test.local','authenticated','authenticated');

insert into companies(id,name,country_code,country_name,default_currency_code,created_by)
values('97100000-0000-4000-8000-000000000001','Currency Guinea','GN','Guinee','GNF','97000000-0000-4000-8000-000000000001');

insert into client_businesses(client_id,company_id,is_primary,created_by)
values('97000000-0000-4000-8000-000000000001','97100000-0000-4000-8000-000000000001',true,'97000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub','97000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select is(
  (select currency from subscription_quote(
    '97100000-0000-4000-8000-000000000001',
    (select id from plans where code='basic'),'monthly',null
  )),
  'GNF',
  'the company currency is used by the subscription quote'
);

select is(
  (select base_amount from subscription_quote(
    '97100000-0000-4000-8000-000000000001',
    (select id from plans where code='basic'),'monthly',null
  )),
  120000::numeric,
  'the localized GNF monthly price is used'
);

select is(
  (select base_amount from subscription_quote(
    '97100000-0000-4000-8000-000000000001',
    (select id from plans where code='pro'),'annual',null
  )),
  3000000::numeric,
  'the localized GNF annual price is used'
);

select is(
  (select count(*)::integer from company_subscription_plans('97100000-0000-4000-8000-000000000001')),
  3,
  'all active plans are returned for the company'
);

select is(
  (select count(distinct currency)::integer from company_subscription_plans('97100000-0000-4000-8000-000000000001')),
  1,
  'the localized catalog contains one company currency'
);

select is(
  (select min(currency) from company_subscription_plans('97100000-0000-4000-8000-000000000001')),
  'GNF',
  'the localized catalog is denominated in GNF'
);

select ok(
  (select jsonb_array_length(plan_features)>0 from company_subscription_plans('97100000-0000-4000-8000-000000000001') where code='basic'),
  'localized plans include their entitlements'
);

select lives_ok(
  $$select public.submit_manual_subscription_payment(
    '97100000-0000-4000-8000-000000000001',
    (select id from plans where code='basic'),'monthly','OM-GNF-TEST',null,null,
    '97200000-0000-4000-8000-000000000001'
  )$$,
  'a localized manual payment can be submitted'
);

select is(
  (select currency::text from payment_transactions where provider_reference='OM-GNF-TEST'),
  'GNF',
  'the submitted payment snapshots the company currency'
);

select * from finish();
rollback;
