-- A disabled membership or company must lose access at the database layer,
-- including when an old JWT/session is still valid.
create or replace function public.belongs_to_company(p_company uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin() or exists(
    select 1
    from memberships m
    join companies c on c.id=m.company_id
    where m.user_id=auth.uid()
      and m.company_id=p_company
      and m.is_active
      and c.is_active
  )
$$;

create or replace function public.has_active_subscription(p_company uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin() or (
    exists(select 1 from companies c where c.id=p_company and c.is_active)
    and exists(
      select 1 from subscriptions s
      where s.company_id=p_company
        and s.status in ('trialing','active')
        and coalesce(s.current_period_ends_at,s.trial_ends_at,now()+interval '1 day') > now()
    )
  )
$$;

create or replace function public.has_permission(p_company uuid,p_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin() or exists(
    select 1
    from memberships m
    join companies c on c.id=m.company_id
    join roles r on r.id=m.role_id
    left join role_permissions rp on rp.role_id=r.id
    left join permissions p on p.id=rp.permission_id
    where m.user_id=auth.uid()
      and m.company_id=p_company
      and m.is_active
      and c.is_active
      and (r.code='company_admin' or p.code=p_code)
  )
$$;

create or replace function public.get_my_context()
returns table(
  membership_id uuid,company_id uuid,company_name text,store_id uuid,role app_role,
  role_name text,permissions text[],subscription_status subscription_status
)
language sql
stable
security definer
set search_path=public
as $$
  select null::uuid,null::uuid,'Plateforme StockMaster'::text,null::uuid,
    'super_admin'::app_role,'Super Administrateur'::text,array[]::text[],null::subscription_status
  where public.is_super_admin()
  union all
  select m.id,m.company_id,c.name,m.store_id,r.code,r.name,
    coalesce(array_agg(p.code) filter(where p.code is not null),array[]::text[]),s.status
  from memberships m
  join companies c on c.id=m.company_id and c.is_active
  join roles r on r.id=m.role_id
  left join role_permissions rp on rp.role_id=r.id
  left join permissions p on p.id=rp.permission_id
  left join lateral(
    select status from subscriptions where company_id=m.company_id order by created_at desc limit 1
  ) s on true
  where m.user_id=auth.uid() and m.is_active and not public.is_super_admin()
  group by m.id,c.name,r.code,r.name,s.status
  limit 1
$$;

create or replace function public.get_account_access_status()
returns text
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then return 'unauthenticated'; end if;
  if public.is_super_admin() then return 'super_admin'; end if;
  if not exists(select 1 from memberships where user_id=auth.uid()) then return 'no_membership'; end if;
  if exists(
    select 1 from memberships m join companies c on c.id=m.company_id
    where m.user_id=auth.uid() and m.is_active and not c.is_active
  ) then return 'company_disabled'; end if;
  if exists(select 1 from memberships where user_id=auth.uid() and not is_active) then return 'membership_disabled'; end if;
  if exists(
    select 1 from memberships m join companies c on c.id=m.company_id
    where m.user_id=auth.uid() and m.is_active and c.is_active
  ) then return 'active'; end if;
  return 'access_disabled';
end
$$;

grant execute on function public.get_account_access_status() to authenticated;
revoke all on function public.get_account_access_status() from anon;
