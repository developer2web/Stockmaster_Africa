begin;
create extension if not exists pgtap with schema extensions;
select plan(67);

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

insert into suppliers(id,company_id,store_id,name,is_active,created_by)
values(
  '52000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'Test Supplier',true,'10000000-0000-4000-8000-000000000001'
);

insert into customers(id,company_id,store_id,name,is_active,created_by)
values(
  '51000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'Credit Customer',true,
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
select is((select count(*)::integer from sale_financials),1,'owner can read their financial summary');
select is((select cost_total from sale_financials limit 1),8::numeric,'owner reads the historical cost without base-column access');
select is((select purchase_price_snapshot from sale_item_financials limit 1),4::numeric,'owner reads historical item cost');
select ok(not has_column_privilege('authenticated','public.sales','cost_total','SELECT'),'base sale cost remains protected');
select ok(not has_column_privilege('authenticated','public.sale_items','purchase_price_snapshot','SELECT'),'base item cost remains protected');
select ok(not has_table_privilege('anon','public.sale_financials','SELECT'),'anonymous users cannot read financial summaries');
select ok(not has_table_privilege('anon','public.sale_item_financials','SELECT'),'anonymous users cannot read item costs');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select is((select count(*)::integer from sale_financials),0,'employee cannot read owner financial summaries');
select is((select count(*)::integer from sale_item_financials),0,'employee cannot read owner item costs');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select is((select count(*)::integer from sale_financials),0,'another owner cannot read company A financial summaries');
select is((select count(*)::integer from sale_item_financials),0,'another owner cannot read company A item costs');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
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
select throws_ok(
  $$select * from create_sale_v3(
    '30000000-0000-4000-8000-000000000001','cash',
    '[{"productId":"50000000-0000-4000-8000-000000000001","variantId":null,"quantity":1,"discount":0,"unitPrice":9,"expectedTotal":9}]'::jsonb,
    null,9,'70000000-0000-4000-8000-000000000099',now(),'device-offline-test'
  )$$,
  'Conflit de prix : un article a changé depuis la vente hors ligne. Vérifiez puis recréez cette vente',
  'offline sale refuses a changed catalog price'
);
select is((select quantity from stock_levels where product_id='50000000-0000-4000-8000-000000000001'),8::numeric,'offline price conflict rolls stock back');

select lives_ok(
  $$select * from create_sale_v2(
    '30000000-0000-4000-8000-000000000001','partial',
    '[{"productId":"50000000-0000-4000-8000-000000000001","variantId":null,"quantity":1,"discount":0}]'::jsonb,
    '51000000-0000-4000-8000-000000000001',4,
    '70000000-0000-4000-8000-000000000002'
  )$$,
  'partial sale creates the sale and customer credit atomically'
);
select is(
  (select amount_due from sales where operation_id='70000000-0000-4000-8000-000000000002'),
  6::numeric,
  'partial sale stores the unpaid amount'
);
select is(
  (select amount from customer_ledger where sale_id=(select id from sales where operation_id='70000000-0000-4000-8000-000000000002')),
  6::numeric,
  'partial sale creates one matching customer ledger credit'
);

select lives_ok(
  $$select create_product_with_initial_stock(
    '30000000-0000-4000-8000-000000000001','Atomic Product','Created with stock',
    'ATOMIC-1',null,null,null,'piece',3,7,2,true,5,
    '61000000-0000-4000-8000-000000000001'
  )$$,
  'product and initial stock are created atomically'
);
select is(
  (select sl.quantity from stock_levels sl join products p on p.id=sl.product_id where p.sku='ATOMIC-1'),
  5::numeric,
  'atomic product creation stores the initial quantity'
);

select lives_ok(
  $$select record_purchase(
    '30000000-0000-4000-8000-000000000001',
    '52000000-0000-4000-8000-000000000001',
    '[{"productId":"50000000-0000-4000-8000-000000000001","quantity":1,"unitCost":5}]'::jsonb,
    false,'62000000-0000-4000-8000-000000000001'
  )$$,
  'supplier purchase can be recorded on credit'
);
select is(
  (select amount_due from purchases where operation_id='62000000-0000-4000-8000-000000000001'),
  5::numeric,
  'credit purchase stores the supplier debt'
);
select lives_ok(
  $$select record_supplier_payment(
    '30000000-0000-4000-8000-000000000001',
    '52000000-0000-4000-8000-000000000001',2,'cash','Partial settlement',
    '63000000-0000-4000-8000-000000000001'
  )$$,
  'supplier debt accepts a partial payment'
);
select is(
  (select amount_due from purchases where operation_id='62000000-0000-4000-8000-000000000001'),
  3::numeric,
  'partial payment reduces the purchase debt'
);
select is(
  (select payment_status from purchases where operation_id='62000000-0000-4000-8000-000000000001'),
  'partial',
  'partially settled purchase receives partial status'
);
select is(
  (select count(*)::integer from cash_transactions where source='supplier_payment' and operation_id='63000000-0000-4000-8000-000000000001'),
  1,
  'supplier payment creates one cash withdrawal'
);

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

-- Filtering never widens access to sales or their private financial columns.
select ok(
  jsonb_array_length(get_filtered_sales_history('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001')) > 0,
  'owner can use filtered history'
);
select is(
  jsonb_array_length(get_filtered_sales_history('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',p_search=>'does-not-exist')),
  0,'search is applied before pagination'
);
select is(
  jsonb_array_length(get_filtered_sales_history('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',p_after=>now()+interval '1 day')),
  0,'date lower bound excludes old sales'
);
select is(
  jsonb_array_length(get_filtered_sales_history('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',p_before=>now())),
  0,'exclusive upper bound excludes sales created at the boundary'
);
select ok(
  not (get_filtered_sales_history('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001')->0 ?| array['cost_total','gross_profit']),
  'filtered history does not expose cost or profit'
);
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select is(
  jsonb_array_length(get_filtered_sales_history('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',p_search=>'')),
  0,'another owner cannot filter company A sales'
);
-- sales.write also implies sales.read; remove both before the denial assertion.
reset role;
delete from public.role_permissions where role_id='40000000-0000-4000-8000-000000000002'
  and permission_id in (select id from public.permissions where code in ('sales.read','sales.write'));
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select is(
  jsonb_array_length(get_filtered_sales_history('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001')),
  0,'employee without sales.read cannot filter history'
);
select ok(not has_function_privilege('anon','public.get_filtered_sales_history(uuid,uuid,integer,integer,text,timestamptz,timestamptz,text,text)','EXECUTE'),'anonymous filtered history is denied');

reset role;
insert into public.notifications(id,company_id,user_id,title,body,type,created_at,read_at)
values
 ('a0000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','expired unread','test','test',now()-interval '48 hours',null),
 ('a0000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','expired read','test','test',now()-interval '49 hours',now()),
 ('a0000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','recent','test','test',now()-interval '47 hours',null);
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select is((select count(*)::integer from notifications where id in ('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000003')),1,'expired notifications are hidden before the cron purge');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select is((select count(*)::integer from notifications where id='a0000000-0000-4000-8000-000000000003'),0,'notification recipient isolation is preserved');
reset role;
select ok(not has_function_privilege('authenticated','private.purge_expired_notifications()','EXECUTE'),'client cannot execute global purge');
select ok(not has_function_privilege('anon','private.purge_expired_notifications()','EXECUTE'),'anonymous client cannot execute global purge');
select private.purge_expired_notifications();
select is((select count(*)::integer from notifications where id in ('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002')),0,'purge deletes both read and unread expired notifications');
select is((select count(*)::integer from notifications where id='a0000000-0000-4000-8000-000000000003'),1,'purge preserves recent notifications');
select ok((select count(*) from sales)>0,'notification purge preserves sales');
select is((select count(*)::integer from cron.job where jobname='stockmaster-notification-retention' and active),1,'one active retention cron job is installed');

select * from finish();
rollback;
