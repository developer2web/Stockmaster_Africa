-- Étape 3 : administration globale de la plateforme.
alter table public.companies add column if not exists is_active boolean not null default true;

create or replace function public.super_admin_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare result jsonb;
begin
  if not public.is_super_admin() then raise exception 'Super administrator access required'; end if;
  select jsonb_build_object(
    'companies', (select count(*) from companies),
    'active_companies', (select count(*) from companies where is_active),
    'stores', (select count(*) from stores),
    'users', (select count(*) from profiles),
    'sales', (select count(*) from sales),
    'revenue', coalesce((select sum(total) from sales), 0),
    'monthly_sales', coalesce((
      select jsonb_agg(jsonb_build_object('month', month_key, 'revenue', revenue, 'sales', sale_count) order by month_key)
      from (
        select to_char(months.month, 'YYYY-MM') month_key,
          coalesce(sum(s.total), 0) revenue, count(s.id) sale_count
        from generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') months(month)
        left join sales s on s.created_at >= months.month and s.created_at < months.month + interval '1 month'
        group by months.month
      ) chart
    ), '[]'::jsonb),
    'subscriptions', coalesce((
      select jsonb_object_agg(status::text, amount)
      from (select status, count(*) amount from subscriptions group by status) grouped
    ), '{}'::jsonb)
  ) into result;
  return result;
end $$;

create or replace function public.super_admin_companies()
returns table(
  id uuid, name text, slug text, is_active boolean, created_at timestamptz,
  store_count bigint, user_count bigint, sale_count bigint, revenue numeric,
  subscription_status public.subscription_status
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id,c.name,c.slug,c.is_active,c.created_at,
    (select count(*) from stores st where st.company_id=c.id),
    (select count(*) from memberships m where m.company_id=c.id),
    (select count(*) from sales sa where sa.company_id=c.id),
    coalesce((select sum(sa.total) from sales sa where sa.company_id=c.id),0),
    (select s.status from subscriptions s where s.company_id=c.id order by s.created_at desc limit 1)
  from companies c
  where public.is_super_admin()
  order by c.created_at desc
$$;

create or replace function public.super_admin_users()
returns table(
  membership_id uuid, user_id uuid, email text, full_name text, company_id uuid,
  company_name text, store_name text, role_name text, is_active boolean, created_at timestamptz
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select m.id,m.user_id,u.email,p.full_name,m.company_id,c.name,st.name,r.name,m.is_active,m.created_at
  from memberships m
  join profiles p on p.id=m.user_id
  join auth.users u on u.id=m.user_id
  join companies c on c.id=m.company_id
  join roles r on r.id=m.role_id
  left join stores st on st.id=m.store_id
  where public.is_super_admin()
  order by m.created_at desc
$$;

create or replace function public.set_company_active(p_company_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then raise exception 'Super administrator access required'; end if;
  update companies set is_active=p_active where id=p_company_id;
  if not found then raise exception 'Company not found'; end if;
end $$;

create or replace function public.set_membership_active(p_membership_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then raise exception 'Super administrator access required'; end if;
  update memberships set is_active=p_active where id=p_membership_id;
  if not found then raise exception 'Membership not found'; end if;
end $$;

grant execute on function public.super_admin_dashboard() to authenticated;
grant execute on function public.super_admin_companies() to authenticated;
grant execute on function public.super_admin_users() to authenticated;
grant execute on function public.set_company_active(uuid,boolean) to authenticated;
grant execute on function public.set_membership_active(uuid,boolean) to authenticated;
revoke all on function public.super_admin_dashboard() from anon;
revoke all on function public.super_admin_companies() from anon;
revoke all on function public.super_admin_users() from anon;
revoke all on function public.set_company_active(uuid,boolean) from anon;
revoke all on function public.set_membership_active(uuid,boolean) from anon;

