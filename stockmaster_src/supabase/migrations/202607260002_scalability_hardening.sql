-- Scalable employee lookup and currency-safe platform aggregates.

create table if not exists public.user_email_directory (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email_normalized text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email_normalized = lower(trim(email_normalized)))
);

alter table public.user_email_directory enable row level security;
revoke all on public.user_email_directory from anon, authenticated;

create or replace function public.sync_user_email_directory()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null or trim(new.email) = '' then
    delete from public.user_email_directory where user_id = new.id;
    return new;
  end if;

  insert into public.user_email_directory(user_id, email_normalized, updated_at)
  values(new.id, lower(trim(new.email)), now())
  on conflict (user_id) do update
    set email_normalized = excluded.email_normalized,
        updated_at = now();
  return new;
end
$$;

drop trigger if exists sync_user_email_directory on auth.users;
create trigger sync_user_email_directory
after insert or update of email on auth.users
for each row execute function public.sync_user_email_directory();

insert into public.user_email_directory(user_id, email_normalized)
select id, lower(trim(email))
from auth.users
where email is not null and trim(email) <> ''
on conflict (user_id) do update
  set email_normalized = excluded.email_normalized,
      updated_at = now();

create index if not exists products_company_store_created_idx
  on public.products(company_id, store_id, created_at desc);
create index if not exists sales_company_store_created_idx
  on public.sales(company_id, store_id, created_at desc);
create index if not exists memberships_company_created_idx
  on public.memberships(company_id, created_at desc);
create index if not exists audit_logs_company_created_idx
  on public.audit_logs(company_id, created_at desc);

create or replace function public.record_expense(
  p_store_id uuid,
  p_label text,
  p_amount numeric,
  p_expense_date date,
  p_operation_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_expense uuid;
begin
  if p_operation_id is null then
    raise exception 'Identifiant d''opération requis';
  end if;
  if length(trim(p_label)) < 2 then
    raise exception 'Motif requis';
  end if;
  if p_amount <= 0 then
    raise exception 'Le montant doit être positif';
  end if;

  select s.company_id into v_company
  from stores s
  where s.id = p_store_id
    and s.is_active
    and public.can_access_store(s.company_id, s.id)
    and public.has_permission(s.company_id, 'expenses.write')
    and public.has_active_subscription(s.company_id);

  if v_company is null then
    raise exception 'Boutique invalide ou non autorisée';
  end if;

  perform public.lock_operation(p_operation_id);

  select id into v_expense
  from expenses
  where company_id = v_company
    and operation_id = p_operation_id;

  if v_expense is not null then
    return v_expense;
  end if;

  insert into expenses(
    company_id,
    store_id,
    label,
    amount,
    expense_date,
    operation_id,
    created_by
  ) values (
    v_company,
    p_store_id,
    trim(p_label),
    p_amount,
    p_expense_date,
    p_operation_id,
    auth.uid()
  )
  returning id into v_expense;

  return v_expense;
end
$$;

grant execute on function public.record_expense(uuid, text, numeric, date, uuid)
to authenticated;
revoke all on function public.record_expense(uuid, text, numeric, date, uuid)
from anon;

create or replace function public.super_admin_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  result jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Super administrator access required';
  end if;

  select jsonb_build_object(
    'companies', (select count(*) from companies),
    'active_companies', (select count(*) from companies where is_active),
    'stores', (select count(*) from stores),
    'users', (select count(*) from profiles),
    'sales', (select count(*) from sales),
    'revenue_by_currency', coalesce((
      select jsonb_agg(
        jsonb_build_object('currency_code', currency_code, 'revenue', revenue)
        order by currency_code
      )
      from (
        select currency_code::text, sum(total) revenue
        from sales
        group by currency_code
      ) totals
    ), '[]'::jsonb),
    'monthly_sales', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'month', month_key,
          'currency_code', currency_code,
          'revenue', revenue,
          'sales', sale_count
        )
        order by month_key, currency_code
      )
      from (
        select
          to_char(date_trunc('month', s.created_at), 'YYYY-MM') month_key,
          s.currency_code::text currency_code,
          sum(s.total) revenue,
          count(*) sale_count
        from sales s
        where s.created_at >= date_trunc('month', now()) - interval '5 months'
        group by date_trunc('month', s.created_at), s.currency_code
      ) chart
    ), '[]'::jsonb),
    'subscriptions', coalesce((
      select jsonb_object_agg(status::text, amount)
      from (
        select status, count(*) amount
        from subscriptions
        group by status
      ) grouped
    ), '{}'::jsonb)
  ) into result;

  return result;
end
$$;

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
  subscription_status public.subscription_status
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
    (
      select s.status
      from subscriptions s
      where s.company_id = c.id
      order by s.created_at desc
      limit 1
    )
  from companies c
  where public.is_super_admin()
  order by c.created_at desc
$$;
