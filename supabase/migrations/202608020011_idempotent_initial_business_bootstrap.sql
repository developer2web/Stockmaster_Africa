-- The initial onboarding endpoint must be safe to retry after a slow network,
-- a double tap, or an authentication callback replay. Explicit multi-business
-- creation continues to use create_business and is not affected.
create or replace function public.bootstrap_company(
  p_company_name text,
  p_store_name text,
  p_country_code text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_company uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));

  select m.company_id
    into v_existing_company
  from public.memberships m
  join public.companies c on c.id = m.company_id
  where m.user_id = auth.uid()
    and m.is_active
    and c.is_active
  order by m.created_at
  limit 1;

  if v_existing_company is not null then
    return v_existing_company;
  end if;

  return public.create_business(p_company_name, p_store_name, p_country_code);
end;
$$;
grant execute on function public.bootstrap_company(text, text, text) to authenticated;
revoke all on function public.bootstrap_company(text, text, text) from anon;
