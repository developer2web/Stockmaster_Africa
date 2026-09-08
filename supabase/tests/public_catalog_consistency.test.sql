begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users(id,email,aud,role)
values('97300000-0000-4000-8000-000000000001','catalog-owner@test.local','authenticated','authenticated');
insert into companies(id,name,country_code,country_name,default_currency_code,created_by)
values('97400000-0000-4000-8000-000000000001','Catalog test','GN','Guinée','GNF','97300000-0000-4000-8000-000000000001');
insert into client_businesses(client_id,company_id,is_primary,created_by)
values('97300000-0000-4000-8000-000000000001','97400000-0000-4000-8000-000000000001',true,'97300000-0000-4000-8000-000000000001');

-- Deliberately diverge the legacy plans price from the price charged at checkout.
update public.plan_currency_prices set monthly_price=142857
where currency='GNF' and plan_id=(select id from public.plans where code='basic');
update public.plans set name='Basic test cohérence' where code='basic';
update public.plan_features set is_enabled=false
where plan_id=(select id from public.plans where code='basic') and feature_key='inventory';

select ok(has_function_privilege('anon','public.list_public_plans()','EXECUTE'),'public visitors can read the catalog');
select is((select monthly_price from public.list_public_plans() where code='basic'),142857::numeric,'public price follows the billing price');
select is((select name from public.list_public_plans() where code='basic'),'Basic test cohérence','public names follow the catalog');
select ok((select not ('inventory'=any(feature_keys)) from public.list_public_plans() where code='basic'),'disabled rights are not advertised');

set local role authenticated;
select set_config('request.jwt.claim.sub','97300000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select is((select monthly_price from public.company_subscription_plans('97400000-0000-4000-8000-000000000001') where code='basic'),142857::numeric,'Account and Expo use the same price');
select is((select base_amount from public.subscription_quote('97400000-0000-4000-8000-000000000001',(select id from public.plans where code='basic'),'monthly',null)),142857::numeric,'checkout uses the same price');

select * from finish();
rollback;
