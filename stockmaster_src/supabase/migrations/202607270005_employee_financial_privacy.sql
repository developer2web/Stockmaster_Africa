create or replace function public.get_lifetime_net_profit(p_store_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_gross_profit numeric;
  v_expenses numeric;
begin
  select m.company_id into v_company_id
  from memberships m
  join roles r on r.id = m.role_id
  where m.user_id = auth.uid()
    and m.is_active
    and r.code = 'company_admin'
    and exists (
      select 1 from stores st
      where st.id = p_store_id and st.company_id = m.company_id
    )
  limit 1;

  if v_company_id is null then
    raise exception 'Accès financier réservé à l''administrateur';
  end if;

  select coalesce(sum(s.gross_profit), 0) into v_gross_profit
  from sales s
  where s.company_id = v_company_id and s.store_id = p_store_id;

  select coalesce(sum(e.amount), 0) into v_expenses
  from expenses e
  where e.company_id = v_company_id and e.store_id = p_store_id;

  return v_gross_profit - v_expenses;
end
$$;

grant execute on function public.get_lifetime_net_profit(uuid) to authenticated;
revoke all on function public.get_lifetime_net_profit(uuid) from anon;

alter function public.get_business_report(date,date,uuid,uuid,uuid,uuid)
rename to get_business_report_with_financials;

revoke all on function public.get_business_report_with_financials(date,date,uuid,uuid,uuid,uuid)
from public, anon, authenticated;

create function public.get_business_report(
  p_start_date date,
  p_end_date date,
  p_store_id uuid default null,
  p_employee_id uuid default null,
  p_product_id uuid default null,
  p_category_id uuid default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_can_view_financials boolean;
begin
  v_result := public.get_business_report_with_financials(
    p_start_date, p_end_date, p_store_id, p_employee_id, p_product_id, p_category_id
  );

  select public.is_super_admin() or exists (
    select 1
    from memberships m
    join roles r on r.id = m.role_id
    where m.user_id = auth.uid()
      and m.is_active
      and r.code = 'company_admin'
  ) into v_can_view_financials;

  if v_can_view_financials then
    return v_result;
  end if;

  return jsonb_build_object(
    'startDate', v_result->'startDate',
    'endDate', v_result->'endDate',
    'revenue', v_result->'revenue',
    'quantitySold', v_result->'quantitySold',
    'saleCount', v_result->'saleCount',
    'previous', jsonb_build_object('revenue', v_result#>'{previous,revenue}'),
    'topProducts', coalesce((
      select jsonb_agg(item - 'gross_profit')
      from jsonb_array_elements(v_result->'topProducts') item
    ), '[]'::jsonb),
    'paymentMethods', coalesce(v_result->'paymentMethods', '[]'::jsonb),
    'stores', coalesce((
      select jsonb_agg(item - 'gross_profit')
      from jsonb_array_elements(v_result->'stores') item
    ), '[]'::jsonb),
    'employees', coalesce((
      select jsonb_agg(item - 'gross_profit')
      from jsonb_array_elements(v_result->'employees') item
    ), '[]'::jsonb)
  );
end
$$;

grant execute on function public.get_business_report(date,date,uuid,uuid,uuid,uuid)
to authenticated;
revoke all on function public.get_business_report(date,date,uuid,uuid,uuid,uuid)
from anon;
