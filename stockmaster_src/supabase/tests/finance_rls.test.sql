begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

insert into auth.users(id,email,aud,role)
values
  ('10000000-0000-4000-8000-000000000001','owner-a@test.local','authenticated','authenticated'),
  ('10000000-0000-4000-8000-000000000002','employee-a@test.local','authenticated','authenticated'),
  ('10000000-0000-4000-8000-000000000003','owner-b@test.local','authenticated','authenticated');

insert into companies(id,name,country_code,country_name,default_currency_code,created_by)
values
  ('20000000-0000-4000-8000-000000000001','Company A','CA','Canada','CAD','10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002','Company B','US','États-Unis','USD','10000000-0000-4000-8000-000000000003');

insert into client_businesses(client_id,company_id,is_primary,created_by)
values
  ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',true,'10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002',true,'10000000-0000-4000-8000-000000000003');

insert into stores(id,company_id,name,created_by)
values
  ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Store A','10000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','Store B','10000000-0000-4000-8000-000000000003');

insert into roles(id,company_id,name,code,created_by)
values
  ('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Owner A','company_admin','10000000-0000-4000-8000-000000000001'),
  ('40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','Cashier A','employee','10000000-0000-4000-8000-000000000001'),
  ('40000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','Owner B','company_admin','10000000-0000-4000-8000-000000000003');

insert into memberships(company_id,user_id,role_id,store_id,all_stores,created_by)
values
  ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',true,'10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001',false,'10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000002',true,'10000000-0000-4000-8000-000000000003');

insert into membership_stores(company_id,membership_id,store_id,created_by)
select company_id,id,store_id,created_by from memberships where store_id is not null;

insert into subscriptions(company_id,plan_id,status,trial_ends_at,created_by)
values
  (
    '20000000-0000-4000-8000-000000000001',
    (select id from plans where code = 'pro'),
    'trialing',
    now()+interval '1 day',
    '10000000-0000-4000-8000-000000000001'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    (select id from plans where code = 'basic'),
    'trialing',
    now()+interval '1 day',
    '10000000-0000-4000-8000-000000000003'
  );

insert into role_permissions(company_id,role_id,permission_id,created_by)
select
  '20000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000002',
  id,
  '10000000-0000-4000-8000-000000000001'
from permissions
where code in ('products.read','sales.write','stock_movements.write','cash_transactions.write');

insert into products(
  id,company_id,store_id,name,sku,qr_code,purchase_price,sale_price,is_active,created_by
) values(
  '50000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'Test Product','TEST-1','TEST-QR-1',4,10,true,
  '10000000-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);

select is((select count(*)::integer from stores),1,'RLS hides another company stores');
select ok(public.belongs_to_company('20000000-0000-4000-8000-000000000001'),'owner belongs to company A');
select isnt(public.belongs_to_company('20000000-0000-4000-8000-000000000002'),true,'owner does not belong to company B');
select ok(public.has_permission('20000000-0000-4000-8000-000000000001','sales.write'),'company owner inherits permissions');
select ok(
  public.can_use_feature('20000000-0000-4000-8000-000000000001','expenses'),
  'Pro subscription enables expenses'
);
select ok(
  public.can_use_feature('20000000-0000-4000-8000-000000000001','pdf_export'),
  'Pro subscription enables PDF export'
);
select lives_ok(
  $$select set_business_currency(
    '20000000-0000-4000-8000-000000000001','GN',null,'USD',null
  )$$,
  'owner can select country and secondary currency before first sale'
);
select is(
  (select default_currency_code::text from companies where id='20000000-0000-4000-8000-000000000001'),
  'GNF',
  'country assigns its official default currency'
);
select is(
  (select count(*)::integer from currency_change_audit),
  1,
  'currency changes are audited'
);

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select is((select count(*)::integer from stores),1,'employee sees only the assigned company stores');
select isnt(
  public.belongs_to_company('20000000-0000-4000-8000-000000000002'),
  true,
  'employee cannot access another company'
);
select ok(
  public.has_permission('20000000-0000-4000-8000-000000000001','sales.write'),
  'employee receives the assigned sales permission'
);
select isnt(
  public.has_permission('20000000-0000-4000-8000-000000000001','expenses.write'),
  true,
  'employee does not receive an unassigned financial permission'
);
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);

select is(
  (select new_quantity from record_stock_movement(
    '50000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    10,'initial','fixture',null,
    '60000000-0000-4000-8000-000000000001'
  )),
  10::numeric,
  'stock movement adds inventory'
);
select is(
  (select new_quantity from record_stock_movement(
    '50000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    10,'initial','retry',null,
    '60000000-0000-4000-8000-000000000001'
  )),
  10::numeric,
  'stock retry is idempotent'
);

select lives_ok(
  $$select * from create_sale(
    '30000000-0000-4000-8000-000000000001','cash',
    '[{"productId":"50000000-0000-4000-8000-000000000001","variantId":null,"quantity":2,"discount":1}]'::jsonb,
    null,'70000000-0000-4000-8000-000000000001'
  )$$,
  'sale is created atomically'
);
select lives_ok(
  $$select * from create_sale(
    '30000000-0000-4000-8000-000000000001','cash',
    '[{"productId":"50000000-0000-4000-8000-000000000001","variantId":null,"quantity":2,"discount":1}]'::jsonb,
    null,'70000000-0000-4000-8000-000000000001'
  )$$,
  'sale retry returns the existing sale'
);
select is((select count(*)::integer from sales),1,'sale retry creates one sale');
select is((select currency_code::text from sales limit 1),'GNF','sale stores its historical currency');
select throws_ok(
  $$select set_business_currency(
    '20000000-0000-4000-8000-000000000001','CA',null,null,null
  )$$,
  'La devise est verrouillée depuis la première vente',
  'owner cannot change currency after first sale'
);
select is((select quantity from stock_levels where product_id='50000000-0000-4000-8000-000000000001'),8::numeric,'sale decrements stock once');
select is((select count(*)::integer from cash_transactions where source='sale'),1,'sale creates one cash deposit');

select lives_ok(
  $$select record_cash_transaction(
    '30000000-0000-4000-8000-000000000001','deposit','Opening cash',50,
    '80000000-0000-4000-8000-000000000001'
  )$$,
  'manual cash deposit is accepted'
);
select is(
  (
    select count(*)::integer
    from (
      select record_cash_transaction(
        '30000000-0000-4000-8000-000000000001','deposit','Opening cash',50,
        '80000000-0000-4000-8000-000000000001'
      )
    ) retry
    cross join cash_transactions
    where operation_id='80000000-0000-4000-8000-000000000001'
  ),
  1,
  'cash retry creates one transaction'
);

select throws_ok(
  $$select record_cash_transaction(
    null,'deposit','Unassigned cash',50,
    '80000000-0000-4000-8000-000000000002'
  )$$,
  'Sélectionnez une boutique pour cette opération de caisse',
  'cash transactions cannot be shared across all stores'
);

select lives_ok(
  $$select record_expense(
    '30000000-0000-4000-8000-000000000001','Delivery',12,current_date,
    '90000000-0000-4000-8000-000000000001'
  )$$,
  'expense is created with an idempotency key'
);
select is(
  (
    select count(*)::integer
    from (
      select record_expense(
        '30000000-0000-4000-8000-000000000001','Delivery retry',12,current_date,
        '90000000-0000-4000-8000-000000000001'
      )
    ) retry
    cross join expenses
    where operation_id='90000000-0000-4000-8000-000000000001'
  ),
  1,
  'expense retry creates one expense'
);

select * from finish();
rollback;
