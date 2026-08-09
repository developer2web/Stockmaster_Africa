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
  plan_code text
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
    latest_subscription.plan_code
  from companies c
  left join lateral (
    select s.status, p.code as plan_code
    from subscriptions s
    left join plans p on p.id = s.plan_id
    where s.company_id = c.id
    order by s.created_at desc
    limit 1
  ) latest_subscription on true
  where public.is_super_admin()
  order by c.created_at desc
$$;

create or replace function public.super_admin_set_company_plan(
  p_company_id uuid,
  p_plan_code text,
  p_duration_days integer default 30
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_plan_id uuid;
  v_subscription_id uuid;
  v_expires_at timestamptz;
begin
  if not public.is_super_admin() then
    raise exception 'Super administrator access required';
  end if;
  if p_plan_code not in ('basic', 'pro', 'premium') then
    raise exception 'Forfait inconnu';
  end if;
  if p_duration_days < 1 or p_duration_days > 366 then
    raise exception 'Durée de forfait invalide';
  end if;

  select cb.client_id into v_client_id
  from client_businesses cb
  where cb.company_id = p_company_id
  order by cb.is_primary desc, cb.created_at
  limit 1;
  if v_client_id is null then
    raise exception 'Propriétaire de l''entreprise introuvable';
  end if;

  select p.id into v_plan_id
  from plans p
  where p.code = p_plan_code and p.is_active;
  if v_plan_id is null then
    raise exception 'Forfait indisponible';
  end if;

  v_expires_at := now() + make_interval(days => p_duration_days);

  update subscriptions
  set status = 'expired'
  where company_id = p_company_id
    and status in ('pending', 'trialing', 'active', 'past_due');

  insert into subscriptions(
    company_id, client_id, plan_id, status, payment_provider,
    payment_reference, billing_cycle, starts_at, expires_at,
    grace_period_ends_at, current_period_ends_at, auto_renew, created_by
  ) values (
    p_company_id, v_client_id, v_plan_id, 'active', 'super_admin',
    'manual-' || gen_random_uuid()::text, 'monthly', now(), v_expires_at,
    v_expires_at + interval '5 days', v_expires_at, false, auth.uid()
  )
  returning id into v_subscription_id;

  insert into audit_logs(
    company_id, actor_id, action, entity_type, entity_id, payload, created_by
  ) values (
    p_company_id, auth.uid(), 'assign_plan', 'subscriptions',
    v_subscription_id,
    jsonb_build_object('plan_code', p_plan_code, 'duration_days', p_duration_days),
    auth.uid()
  );

  return v_subscription_id;
end
$$;

grant execute on function public.super_admin_companies() to authenticated;
grant execute on function public.super_admin_set_company_plan(uuid,text,integer) to authenticated;
revoke all on function public.super_admin_set_company_plan(uuid,text,integer) from anon;
