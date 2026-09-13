// Isolated compatibility smoke test; does not replace the full Supabase/pgTAP suite.
import { pathToFileURL, fileURLToPath } from 'node:url';
const { PGlite } = await import(process.argv[2] ? pathToFileURL(process.argv[2]).href : '@electric-sql/pglite');
import { readFileSync } from 'node:fs';
const root=fileURLToPath(new URL('../', import.meta.url));
const db=new PGlite();
try {
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema private; create schema auth; create schema cron;
create function cron.schedule(text,text,text) returns bigint language sql as 'select 1::bigint';
create table auth.users(id uuid primary key,email text,aud text,role text,banned_until timestamptz,raw_app_meta_data jsonb default '{}');
create table auth.mfa_factors(user_id uuid,status text);
create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
create function auth.uid() returns uuid language sql as $$select (auth.jwt()->>'sub')::uuid$$;
create table public.profiles(id uuid primary key, is_super_admin boolean default false);
create function public.handle_new_user() returns trigger language plpgsql as $$begin insert into public.profiles(id) values(new.id);return new;end$$;
create trigger auth_insert after insert on auth.users for each row execute function public.handle_new_user();
create function public.is_super_admin() returns boolean language sql security definer as $$select coalesce((select is_super_admin from public.profiles where id=auth.uid()),false)$$;
create table public.companies(id uuid primary key,name text,created_by uuid,is_active boolean default true,plan_archived_at timestamptz);
create table public.plans(id uuid primary key default gen_random_uuid(),name text,code text);
insert into public.plans(name,code) values('Pro','pro');
create table public.roles(id uuid primary key,company_id uuid,name text,code text);
create table public.memberships(company_id uuid,user_id uuid,role_id uuid,is_active boolean default true);
create table public.subscriptions(id uuid primary key,company_id uuid,plan_id uuid,status text,starts_at timestamptz,expires_at timestamptz,current_period_ends_at timestamptz,trial_ends_at timestamptz,created_at timestamptz default now());
create table public.payment_transactions(id uuid primary key,client_id uuid,company_id uuid,plan_id uuid,provider text,provider_reference text,operation_id uuid,billing_cycle text,amount numeric,currency text,status text,subscription_id uuid,confirmed_at timestamptz,failure_reason text);
create table public.notifications(id uuid primary key default gen_random_uuid(),company_id uuid,user_id uuid,title text,body text,type text,created_by uuid,created_at timestamptz default now());
create table public.notification_email_outbox(id uuid primary key default gen_random_uuid(),notification_id uuid references public.notifications(id) on delete cascade,recipient_user_id uuid,recipient_email text,subject text,text_body text,status text default 'pending',attempts integer default 0,next_attempt_at timestamptz default now(),last_error text);
create function public.enqueue_notification_email() returns trigger language plpgsql as $$begin insert into public.notification_email_outbox(notification_id,recipient_user_id,recipient_email,subject,text_body) select new.id,u.id,u.email,new.title,new.body from auth.users u where u.id=new.user_id;return new;end$$;
create trigger queue after insert on public.notifications for each row execute function public.enqueue_notification_email();
create function public.ok(boolean,text) returns text language plpgsql as $$begin if not coalesce($1,false) then raise exception 'FAIL: %',$2;end if;return 'PASS: '||$2;end$$;
create function public.is(anyelement,anyelement,text) returns text language sql as $$select public.ok($1 is not distinct from $2,$3)$$;
create function public.no_plan() returns text language sql as $$select 'begin checks'::text$$;
create function public.finish() returns text language sql as $$select 'checks complete'::text$$;
create function public.throws_ok(text,text,text,text) returns text language plpgsql as $$declare caught text;begin begin execute $1;exception when others then get stacked diagnostics caught=returned_sqlstate;end;return public.ok(caught=$2,$4);end$$;
`);
await db.exec(readFileSync(root+'supabase/migrations/202609120001_billing_email_automation.sql','utf8'));
await db.exec(`create trigger payment_notification after insert or update on public.payment_transactions for each row execute function public.notify_payment_status_change()`);
await db.exec(`
create table public.app_error_events(id uuid primary key default gen_random_uuid(),created_at timestamptz default now(),resolved_at timestamptz,resolved_by uuid,resolution_note text);
alter table public.notifications add column read_at timestamptz;
alter table public.notification_email_outbox add column created_at timestamptz default now(),add column updated_at timestamptz default now();
create function public.is_company_admin(company uuid) returns boolean language sql as $$select exists(select 1 from public.memberships m join public.roles r on r.id=m.role_id where m.company_id=company and m.user_id=auth.uid() and m.is_active and r.code='company_admin')$$;
`);
await db.exec(readFileSync(root+'supabase/migrations/202609120002_admin_monitoring_notifications.sql','utf8'));
const checks=readFileSync(root+'supabase/tests/billing_email_automation.test.sql','utf8').replace('create extension if not exists pgtap with schema extensions;','');
for(const result of await db.exec(checks)) for(const row of result.rows) console.log(Object.values(row).join(' '));
await db.exec(`
create table public.products(id uuid primary key,company_id uuid,store_id uuid,purchase_price numeric);
create table public.product_variants(id uuid primary key,product_id uuid,company_id uuid,purchase_price numeric);
create function public.belongs_to_company(company uuid) returns boolean language sql as $$select exists(select 1 from public.memberships where company_id=company and user_id=auth.uid() and is_active)$$;
create function public.can_access_store(company uuid,store uuid) returns boolean language sql as $$select public.belongs_to_company(company)$$;
create function public.has_permission(p_company uuid,p_code text) returns boolean language sql as $$select false$$;
`);
await db.exec(readFileSync(root+'supabase/migrations/202609120003_product_cost_views_compatibility.sql','utf8'));
const adminChecks=readFileSync(root+'supabase/tests/admin_monitoring_notifications.test.sql','utf8').replace('create extension if not exists pgtap with schema extensions;','');
for(const result of await db.exec(adminChecks)) for(const row of result.rows) console.log(Object.values(row).join(' '));
await db.exec(`begin;
insert into auth.users(id,email) values('eb100000-0000-4000-8000-000000000001','cost-owner@example.invalid');
insert into public.companies(id,name) values('eb200000-0000-4000-8000-000000000001','Cost company');
insert into public.roles(id,company_id,code) values('eb300000-0000-4000-8000-000000000001','eb200000-0000-4000-8000-000000000001','company_admin');
insert into public.memberships(company_id,user_id,role_id) values('eb200000-0000-4000-8000-000000000001','eb100000-0000-4000-8000-000000000001','eb300000-0000-4000-8000-000000000001');
insert into public.products values('eb400000-0000-4000-8000-000000000001','eb200000-0000-4000-8000-000000000001',gen_random_uuid(),100);
select set_config('request.jwt.claims','{"sub":"eb100000-0000-4000-8000-000000000001"}',true);
select public.is((select count(*)::integer from public.product_costs),1,'owner can query compatible cost view');
update public.memberships set is_active=false;
select public.is((select count(*)::integer from public.product_costs),0,'revoked member cannot query costs');
rollback;`);
console.log('PASS: compatible product costs and revoked membership');
await db.exec(`
create schema storage;
create table storage.objects(bucket_id text,name text,metadata jsonb);
create table public.client_businesses(client_id uuid,company_id uuid,is_primary boolean,created_by uuid);
create table public.billing_settings(id boolean primary key,orange_money_number text,orange_money_account_name text);
insert into public.billing_settings values(true,'+224600000000','Test only');
alter table public.plans add column max_businesses integer default 1,add column is_active boolean default true;
alter table public.payment_transactions add column retained_company_id uuid,add column request_details jsonb,
add column base_amount numeric,add column discount_amount numeric,add column proof_path text,
add column submitted_at timestamptz,add column promotion_id uuid,add column bonus_days integer;
alter table public.payment_transactions alter column id set default gen_random_uuid();
create table public.payment_status_log(payment_transaction_id uuid,old_status text,new_status text,source text,payload jsonb);
create function public.lock_operation(uuid) returns void language sql as $$select pg_advisory_xact_lock(hashtextextended($1::text,0))$$;
create function public.subscription_quote(uuid,uuid,text,text) returns table(base_amount numeric,discount_amount numeric,final_amount numeric,currency text,promotion_id uuid,bonus_days integer) language sql as $$select 100::numeric,0::numeric,100::numeric,'GNF'::text,null::uuid,0$$;
`);
await db.exec(readFileSync(root+'supabase/migrations/202609120004_orange_money_declaration_compatibility.sql','utf8'));
const manualChecks=readFileSync(root+'supabase/tests/manual_payment_safety.test.sql','utf8').replace('create extension if not exists pgtap with schema extensions;','');
for(const result of await db.exec(manualChecks)) for(const row of result.rows) console.log(Object.values(row).join(' '));
await db.exec(`
create type public.subscription_status as enum ('active','trialing','past_due','expired','canceled','pending');
alter table public.subscriptions alter column status type public.subscription_status using status::public.subscription_status;
alter table public.subscriptions add column client_id uuid,add column billing_cycle text,add column grace_period_ends_at timestamptz;
alter table public.plans add column max_stores integer default 1,add column max_employees integer default 3;
create table public.permissions(id uuid primary key,code text);
create table public.role_permissions(role_id uuid,permission_id uuid);
`);
await db.exec(readFileSync(root+'supabase/migrations/202609120005_expired_subscription_read_only.sql','utf8'));
for(const result of await db.exec(readFileSync(root+'supabase/tests/expired_subscription_read_only.test.sql','utf8'))) for(const row of result.rows) console.log(Object.values(row).join(' '));
await db.exec(`
create function auth.role() returns text language sql as $$select auth.jwt()->>'role'$$;
alter table public.payment_transactions add column created_at timestamptz default now();
alter table public.profiles add column full_name text;
create table public.stores(id uuid,name text);
create table public.customers(id uuid,company_id uuid,name text);
create table public.sales(id uuid,company_id uuid,store_id uuid,customer_id uuid,reference text,subtotal numeric,discount_total numeric,total numeric,amount_paid numeric,amount_due numeric,payment_status text,currency_code text,secondary_currency_code text,secondary_exchange_rate numeric,exchange_rate_effective_at timestamptz,payment_method text,created_by uuid,created_at timestamptz);
`);
await db.exec(readFileSync(root+'supabase/migrations/202609120006_missing_server_functions.sql','utf8'));
console.log('PASS: missing server functions compile against isolated schema');
await db.exec(`create table cron.job(jobid bigint,jobname text,active boolean);create table cron.job_run_details(jobid bigint,status text,start_time timestamptz);`);
await db.exec(readFileSync(root+'supabase/migrations/202609120007_server_configuration_health.sql','utf8'));
await db.exec(`begin;
insert into auth.users(id,email) values('ed100000-0000-4000-8000-000000000001','health@example.invalid');
select set_config('request.jwt.claims','{"sub":"ed100000-0000-4000-8000-000000000001"}',true);
select public.throws_ok('select public.super_admin_server_health()','42501',null,'owner cannot inspect platform health');
update public.profiles set is_super_admin=true where id=auth.uid();
select public.ok((public.super_admin_server_health()->>'readOnlyEnforced')::boolean,'health reports installed expiry guard');
select public.ok(not exists(select 1 from jsonb_array_elements(public.super_admin_server_health()->'functions') f where not (f->>'available')::boolean),'health signatures match installed functions');
rollback;`);
console.log('PASS: server health restricted to Super Admin and function signatures valid');
await db.exec(`
create table public.membership_stores(company_id uuid);
create function public.get_report_filters() returns boolean language sql as $$select public.has_permission(m.company_id,'stores.write') from public.memberships m limit 1$$;
`);
await db.exec(readFileSync(root+'supabase/migrations/202609120008_preserve_expired_read_access.sql','utf8'));
for(const result of await db.exec(readFileSync(root+'supabase/tests/expired_employee_read_access.test.sql','utf8'))) for(const row of result.rows) console.log(Object.values(row).join(' '));
} catch(e) { console.error(e.message);process.exitCode=1; }
finally {await db.close();}
