-- Detailed sales reporting grouped by product and seller.
create or replace function public.get_employee_product_sales(
  p_start_date date, p_end_date date, p_store_id uuid,
  p_employee_id uuid default null, p_product_id uuid default null, p_category_id uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_company_id uuid; v_is_admin boolean;
begin
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then raise exception 'Période invalide'; end if;
  if p_end_date - p_start_date > 366 then raise exception 'La période ne peut pas dépasser 367 jours'; end if;

  select s.company_id into v_company_id from stores s
  where s.id = p_store_id and s.is_active and public.can_access_store(s.company_id, s.id);
  if v_company_id is null or not (public.has_permission(v_company_id, 'daily_reports.read') or public.has_permission(v_company_id, 'monthly_reports.read')) then
    raise exception 'Accès aux rapports refusé';
  end if;

  select public.is_super_admin() or exists (
    select 1 from memberships m join roles r on r.id = m.role_id
    where m.company_id = v_company_id and m.user_id = auth.uid() and m.is_active and r.code = 'company_admin'
  ) into v_is_admin;
  if not v_is_admin then
    p_employee_id := auth.uid();
  elsif p_employee_id is not null and not exists (
    select 1 from memberships m where m.company_id = v_company_id and m.user_id = p_employee_id and m.is_active
  ) then raise exception 'Employé invalide'; end if;

  return coalesce((select jsonb_agg(to_jsonb(result) order by result.revenue desc, result.product_name)
    from (
      select p.id product_id,
        case when pv.name is null then p.name else p.name || ' · ' || pv.name end product_name,
        s.created_by employee_id, coalesce(nullif(pr.full_name, ''), 'Vendeur inconnu') employee_name,
        sum(si.quantity) quantity, sum(si.line_total) revenue, count(distinct s.id) sale_count
      from sales s join sale_items si on si.sale_id = s.id join products p on p.id = si.product_id
      left join product_variants pv on pv.id = si.product_variant_id left join profiles pr on pr.id = s.created_by
      where s.company_id = v_company_id and s.store_id = p_store_id
        and s.created_at >= p_start_date::timestamptz and s.created_at < (p_end_date + 1)::timestamptz
        and (p_employee_id is null or s.created_by = p_employee_id)
        and (p_product_id is null or si.product_id = p_product_id)
        and (p_category_id is null or p.category_id = p_category_id)
      group by p.id, p.name, pv.id, pv.name, s.created_by, pr.full_name
    ) result), '[]'::jsonb);
end $$;
grant execute on function public.get_employee_product_sales(date,date,uuid,uuid,uuid,uuid) to authenticated;
revoke all on function public.get_employee_product_sales(date,date,uuid,uuid,uuid,uuid) from anon;
create index if not exists sales_store_creator_created_at_idx on public.sales(store_id, created_by, created_at);
