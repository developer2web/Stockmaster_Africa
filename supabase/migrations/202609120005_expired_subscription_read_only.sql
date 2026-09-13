begin;
-- Only the latest subscription controls business writes. Grace does not extend write access.
create or replace function public.has_active_subscription(p_company uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((select s.status in ('trialing','active')
    and coalesce(s.starts_at,now())<=now()
    and coalesce(s.expires_at,s.current_period_ends_at,s.trial_ends_at)>now()
    from public.subscriptions s join public.companies c on c.id=s.company_id
    where s.company_id=p_company and c.is_active and c.plan_archived_at is null
    order by s.created_at desc,s.id desc limit 1),false)
$$;
create or replace function public.has_permission(p_company uuid,p_code text)
returns boolean language sql stable security definer set search_path='' as $$
  select (p_code like '%.read' or public.has_active_subscription(p_company)) and exists(
    select 1 from public.memberships m
    join public.companies c on c.id=m.company_id and c.is_active and c.plan_archived_at is null
    join public.roles r on r.id=m.role_id and r.company_id=m.company_id
    left join public.role_permissions rp on rp.role_id=r.id
    left join public.permissions p on p.id=rp.permission_id
    where m.user_id=auth.uid() and m.company_id=p_company and m.is_active
    and (r.code='company_admin' or p.code=p_code
      or (p_code like '%.read' and p.code=regexp_replace(p_code,'\.read$','.write'))))
$$;

create or replace function public.current_subscription(p_company_id uuid default null)
returns table(subscription_id uuid,client_id uuid,plan_id uuid,plan_code text,plan_name text,
 status public.subscription_status,billing_cycle text,starts_at timestamptz,expires_at timestamptz,
 grace_period_ends_at timestamptz,is_read_only boolean,max_businesses integer,max_stores integer,max_employees integer)
language sql stable security definer set search_path='' as $$
 select s.id,s.client_id,p.id,p.code,p.name,s.status,s.billing_cycle,s.starts_at,
 coalesce(s.expires_at,s.current_period_ends_at,s.trial_ends_at),s.grace_period_ends_at,
 not public.has_active_subscription(s.company_id),p.max_businesses,p.max_stores,p.max_employees
 from public.subscriptions s join public.plans p on p.id=s.plan_id
 where (p_company_id is not null and s.company_id=p_company_id and (public.belongs_to_company(p_company_id) or public.is_super_admin()))
 or (p_company_id is null and (s.client_id=auth.uid() or public.is_super_admin()))
 order by s.created_at desc,s.id desc limit 1
$$;

-- Runs even inside SECURITY DEFINER business RPCs; reads are untouched.
create function private.guard_expired_business_write()
returns trigger language plpgsql security definer set search_path='' as $$
declare old_company uuid; new_company uuid; company uuid;
begin
  if auth.uid() is null or public.is_super_admin() then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if tg_op<>'INSERT' then old_company=(to_jsonb(old)->>tg_argv[0])::uuid; end if;
  if tg_op<>'DELETE' then new_company=(to_jsonb(new)->>tg_argv[0])::uuid; end if;
  foreach company in array array[old_company,new_company] loop
    -- Initial company bootstrap inserts its subscription after its first business rows.
    if company is not null and exists(select 1 from public.subscriptions where company_id=company)
       and not public.has_active_subscription(company) then
      raise exception 'Abonnement expiré : lecture seule. Renouvelez pour ajouter, modifier ou supprimer.' using errcode='42501';
    end if;
  end loop;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function private.guard_expired_business_write() from public,anon,authenticated;
do $$
declare target record;
begin
  for target in
    select c.table_name from information_schema.columns c
    join information_schema.tables t on t.table_schema=c.table_schema and t.table_name=c.table_name and t.table_type='BASE TABLE'
    where c.table_schema='public' and c.column_name='company_id'
      and c.table_name not in ('subscriptions','payments','payment_transactions','payment_status_log','client_businesses',
        'notifications','notification_email_outbox','app_error_events','audit_logs','support_tickets','support_messages',
        'user_security_events','account_deletion_requests','subscription_usage','promotion_redemptions','admin_access_requests')
  loop
    execute format('create trigger guard_expired_business_write before insert or update or delete on public.%I for each row execute function private.guard_expired_business_write(''company_id'')',target.table_name);
  end loop;
  create trigger guard_expired_business_write before update or delete on public.companies
    for each row execute function private.guard_expired_business_write('id');
end $$;
notify pgrst,'reload schema';
commit;
