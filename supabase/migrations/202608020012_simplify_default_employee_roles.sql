-- Keep the default employee model intentionally small and readable.
-- Existing custom roles are preserved. Only former automatic roles are merged.

create or replace function public.create_default_employee_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  employee_role uuid;
  accountant_role uuid;
begin
  insert into roles(company_id, name, code, created_by)
  values(new.id, 'Employé', 'employee', new.created_by)
  returning id into employee_role;

  insert into role_permissions(company_id, role_id, permission_id, created_by)
  select new.id, employee_role, p.id, new.created_by
  from permissions p
  where p.code in (
    'stores.read', 'products.read', 'categories.read', 'suppliers.read',
    'stock_movements.read', 'sales.read', 'sales.write',
    'cash_transactions.read', 'cash_transactions.write'
  );

  insert into roles(company_id, name, code, created_by)
  values(new.id, 'Comptable', 'employee', new.created_by)
  returning id into accountant_role;

  insert into role_permissions(company_id, role_id, permission_id, created_by)
  select new.id, accountant_role, p.id, new.created_by
  from permissions p
  where p.code in (
    'stores.read', 'sales.read', 'purchases.read', 'payments.read',
    'expenses.read', 'expenses.write', 'cash_transactions.read',
    'daily_reports.read', 'monthly_reports.read'
  );
  return new;
end;
$$;
do $$
declare
  company_record record;
  employee_role uuid;
  manager_role uuid;
  accountant_role uuid;
begin
  for company_record in select id, created_by from companies loop
    select id into employee_role from roles
    where company_id = company_record.id and lower(name) = lower('Employé') limit 1;
    if employee_role is null then
      insert into roles(company_id, name, code, created_by)
      values(company_record.id, 'Employé', 'employee', company_record.created_by)
      returning id into employee_role;
    end if;

    select id into manager_role from roles
    where company_id = company_record.id and lower(name) = lower('Manager') limit 1;
    if manager_role is null then
      insert into roles(company_id, name, code, created_by)
      values(company_record.id, 'Manager', 'employee', company_record.created_by)
      returning id into manager_role;
    end if;

    select id into accountant_role from roles
    where company_id = company_record.id and lower(name) = lower('Comptable') limit 1;
    if accountant_role is null then
      insert into roles(company_id, name, code, created_by)
      values(company_record.id, 'Comptable', 'employee', company_record.created_by)
      returning id into accountant_role;
    end if;

    update memberships
    set role_id = employee_role
    where company_id = company_record.id
      and role_id in (
        select id from roles
        where company_id = company_record.id
          and lower(name) in (lower('Caissier'), lower('Gestionnaire de stock'))
      );

    delete from roles
    where company_id = company_record.id
      and lower(name) in (lower('Caissier'), lower('Gestionnaire de stock'));

    delete from role_permissions
    where role_id in (employee_role, manager_role, accountant_role);

    insert into role_permissions(company_id, role_id, permission_id, created_by)
    select company_record.id, employee_role, p.id, company_record.created_by
    from permissions p where p.code in (
      'stores.read', 'products.read', 'categories.read', 'suppliers.read',
      'stock_movements.read', 'sales.read', 'sales.write',
      'cash_transactions.read', 'cash_transactions.write'
    );

    insert into role_permissions(company_id, role_id, permission_id, created_by)
    select company_record.id, manager_role, p.id, company_record.created_by
    from permissions p where p.code in (
      'stores.read', 'stores.write', 'products.read', 'products.write',
      'categories.read', 'categories.write', 'suppliers.read', 'suppliers.write',
      'product_variants.read', 'product_variants.write',
      'stock_movements.read', 'stock_movements.write',
      'sales.read', 'sales.write', 'expenses.read', 'expenses.write',
      'cash_transactions.read', 'cash_transactions.write',
      'daily_reports.read', 'monthly_reports.read'
    );

    insert into role_permissions(company_id, role_id, permission_id, created_by)
    select company_record.id, accountant_role, p.id, company_record.created_by
    from permissions p where p.code in (
      'stores.read', 'sales.read', 'purchases.read', 'payments.read',
      'expenses.read', 'expenses.write', 'cash_transactions.read',
      'daily_reports.read', 'monthly_reports.read'
    );
  end loop;
end;
$$;
create or replace function public.create_business(
  p_company_name text,
  p_store_name text,
  p_country_code text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_store uuid;
  v_admin uuid;
  v_manager uuid;
  v_plan uuid;
  v_map country_currency_map%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(trim(p_company_name)) < 2 or length(trim(p_store_name)) < 2 then
    raise exception 'Nom invalide';
  end if;

  select * into v_map from country_currency_map
  where country_code = upper(trim(p_country_code)) and is_active;
  if not found then raise exception 'Pays non pris en charge'; end if;

  insert into companies(name, country_code, country_name, default_currency_code, created_by)
  values(trim(p_company_name), v_map.country_code, v_map.country_name,
    v_map.default_currency_code, auth.uid())
  returning id into v_company;

  insert into stores(company_id, name, created_by)
  values(v_company, trim(p_store_name), auth.uid()) returning id into v_store;
  insert into roles(company_id, name, code, created_by)
  values(v_company, 'Propriétaire', 'company_admin', auth.uid()) returning id into v_admin;
  insert into memberships(company_id, user_id, role_id, store_id, all_stores, created_by)
  values(v_company, auth.uid(), v_admin, v_store, true, auth.uid());
  insert into client_businesses(client_id, company_id, is_primary, created_by)
  values(auth.uid(), v_company,
    not exists(select 1 from client_businesses where client_id = auth.uid()), auth.uid());
  insert into membership_stores(company_id, membership_id, store_id, created_by)
  select v_company, id, v_store, auth.uid() from memberships
  where company_id = v_company and user_id = auth.uid();

  -- Employé and Comptable are created by the company trigger.
  insert into roles(company_id, name, code, created_by)
  values(v_company, 'Manager', 'employee', auth.uid()) returning id into v_manager;
  insert into role_permissions(company_id, role_id, permission_id, created_by)
  select v_company, v_manager, p.id, auth.uid() from permissions p where p.code in (
    'stores.read', 'stores.write', 'products.read', 'products.write',
    'categories.read', 'categories.write', 'suppliers.read', 'suppliers.write',
    'product_variants.read', 'product_variants.write',
    'stock_movements.read', 'stock_movements.write',
    'sales.read', 'sales.write', 'expenses.read', 'expenses.write',
    'cash_transactions.read', 'cash_transactions.write',
    'daily_reports.read', 'monthly_reports.read'
  );

  select id into v_plan from subscription_plans where code = 'basic';
  insert into subscriptions(company_id, plan_id, status, trial_ends_at,
    current_period_ends_at, created_by)
  values(v_company, v_plan, 'trialing', now() + interval '14 days',
    now() + interval '14 days', auth.uid());
  return v_company;
end;
$$;
