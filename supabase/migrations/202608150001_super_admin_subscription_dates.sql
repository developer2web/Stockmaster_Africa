-- Expose the current subscription lifecycle to the Super Admin portal.
drop function if exists public.super_admin_companies();

create function public.super_admin_companies()
returns table(
  id uuid,
  name text,
  slug text,
  is_active boolean,
  created_at timestamptz,
  store_count bigint,
  user_count bigint,
  sale_count bigint,
  revenue numeric,
  currency_code text,
  subscription_status public.subscription_status,
  plan_code text,
  subscription_starts_at timestamptz,
  subscription_expires_at timestamptz,
  trial_ends_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.name,
    c.slug,
    c.is_active,
    c.created_at,
    (select count(*) from stores st where st.company_id = c.id),
    (select count(*) from memberships m where m.company_id = c.id),
    (select count(*) from sales sa where sa.company_id = c.id),
    coalesce((select sum(sa.total) from sales sa where sa.company_id = c.id), 0),
    c.default_currency_code::text,
    latest_subscription.status,
    latest_subscription.plan_code,
    latest_subscription.starts_at,
    latest_subscription.expires_at,
    latest_subscription.trial_ends_at
  from companies c
  left join lateral (
    select
      s.status,
      p.code as plan_code,
      s.starts_at,
      coalesce(s.current_period_ends_at, s.expires_at, s.trial_ends_at) as expires_at,
      s.trial_ends_at
    from subscriptions s
    left join plans p on p.id = s.plan_id
    where s.company_id = c.id
    order by s.created_at desc
    limit 1
  ) latest_subscription on true
  where public.is_super_admin()
  order by c.created_at desc
$$;

grant execute on function public.super_admin_companies() to authenticated;
revoke all on function public.super_admin_companies() from anon;
