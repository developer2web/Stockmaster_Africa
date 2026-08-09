-- Avoid creating "Comptable" twice when the company trigger has already
-- inserted the default employee and accounting roles.
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
  v_plan uuid;
  v_map country_currency_map%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if length(trim(p_company_name)) < 2 or length(trim(p_store_name)) < 2 then
    raise exception 'Nom invalide';
  end if;

  select *
  into v_map
  from country_currency_map
  where country_code = upper(trim(p_country_code))
    and is_active;

  if not found then
    raise exception 'Pays non pris en charge';
  end if;

  insert into companies(
    name,
    country_code,
    country_name,
    default_currency_code,
    created_by
  ) values (
    trim(p_company_name),
    v_map.country_code,
    v_map.country_name,
    v_map.default_currency_code,
    auth.uid()
  )
  returning id into v_company;

  insert into stores(company_id, name, created_by)
  values(v_company, trim(p_store_name), auth.uid())
  returning id into v_store;

  insert into roles(company_id, name, code, created_by)
  values(v_company, 'Propriétaire', 'company_admin', auth.uid())
  returning id into v_admin;

  insert into memberships(
    company_id,
    user_id,
    role_id,
    store_id,
    all_stores,
    created_by
  ) values (
    v_company,
    auth.uid(),
    v_admin,
    v_store,
    true,
    auth.uid()
  );

  insert into client_businesses(client_id, company_id, is_primary, created_by)
  values(
    auth.uid(),
    v_company,
    not exists(
      select 1 from client_businesses where client_id = auth.uid()
    ),
    auth.uid()
  );

  insert into membership_stores(company_id, membership_id, store_id, created_by)
  select v_company, id, v_store, auth.uid()
  from memberships
  where company_id = v_company
    and user_id = auth.uid();

  -- "Employé" and "Comptable" are created by create_default_employee_role.
  insert into roles(company_id, name, code, created_by)
  values
    (v_company, 'Manager', 'employee', auth.uid()),
    (v_company, 'Caissier', 'employee', auth.uid()),
    (v_company, 'Gestionnaire de stock', 'employee', auth.uid());

  select id into v_plan
  from subscription_plans
  where code = 'basic';

  insert into subscriptions(
    company_id,
    plan_id,
    status,
    trial_ends_at,
    current_period_ends_at,
    created_by
  ) values (
    v_company,
    v_plan,
    'trialing',
    now() + interval '14 days',
    now() + interval '14 days',
    auth.uid()
  );

  return v_company;
end
$$;
