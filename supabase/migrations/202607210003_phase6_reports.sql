-- Phase 6: secure, server-side financial reports and report filter metadata.

create index if not exists expenses_company_date_idx on public.expenses(company_id, expense_date, store_id);
create index if not exists sale_items_company_product_idx on public.sale_items(company_id, product_id);
create or replace function public.get_report_filters()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_company uuid;
  v_store uuid;
  v_can_all_stores boolean;
  v_result jsonb;
begin
  select m.company_id, m.store_id,
    (r.code='company_admin' or public.has_permission(m.company_id,'stores.write'))
  into v_company, v_store, v_can_all_stores
  from memberships m join roles r on r.id=m.role_id
  where m.user_id=auth.uid() and m.is_active
    and (r.code='company_admin' or public.has_permission(m.company_id,'daily_reports.read') or public.has_permission(m.company_id,'monthly_reports.read'))
  limit 1;
  if v_company is null then raise exception 'Accès aux rapports refusé'; end if;

  select jsonb_build_object(
    'stores', coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name)
      from stores s where s.company_id=v_company and s.is_active and (v_can_all_stores or s.id=v_store)),'[]'::jsonb),
    'employees', coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',coalesce(nullif(p.full_name,''),'Employé')) order by p.full_name)
      from memberships m join profiles p on p.id=m.user_id
      where m.company_id=v_company and m.is_active and (v_can_all_stores or m.store_id=v_store)),'[]'::jsonb),
    'products', coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name)
      from products p where p.company_id=v_company and p.is_active),'[]'::jsonb),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) order by c.name)
      from categories c where c.company_id=v_company and c.is_active),'[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;
create or replace function public.get_business_report(
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
set search_path=public
as $$
declare
  v_company uuid;
  v_member_store uuid;
  v_can_all_stores boolean;
  v_days integer;
  v_previous_start date;
  v_previous_end date;
  v_result jsonb;
begin
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date then raise exception 'Période invalide'; end if;
  if p_end_date-p_start_date>366 then raise exception 'La période ne peut pas dépasser 367 jours'; end if;

  select m.company_id,m.store_id,(r.code='company_admin' or public.has_permission(m.company_id,'stores.write'))
  into v_company,v_member_store,v_can_all_stores
  from memberships m join roles r on r.id=m.role_id
  where m.user_id=auth.uid() and m.is_active
    and (r.code='company_admin' or public.has_permission(m.company_id,'daily_reports.read') or public.has_permission(m.company_id,'monthly_reports.read'))
  limit 1;
  if v_company is null then raise exception 'Accès aux rapports refusé'; end if;
  if not v_can_all_stores then
    if v_member_store is null then raise exception 'Aucune boutique attribuée'; end if;
    if p_store_id is not null and p_store_id<>v_member_store then raise exception 'Cette boutique ne vous est pas attribuée'; end if;
    p_store_id:=v_member_store;
  end if;
  if p_store_id is not null and not exists(select 1 from stores where id=p_store_id and company_id=v_company) then raise exception 'Boutique invalide'; end if;
  if p_employee_id is not null and not exists(select 1 from memberships where user_id=p_employee_id and company_id=v_company and is_active) then raise exception 'Employé invalide'; end if;
  if p_product_id is not null and not exists(select 1 from products where id=p_product_id and company_id=v_company) then raise exception 'Produit invalide'; end if;
  if p_category_id is not null and not exists(select 1 from categories where id=p_category_id and company_id=v_company) then raise exception 'Catégorie invalide'; end if;

  v_days:=p_end_date-p_start_date+1;
  v_previous_end:=p_start_date-1;
  v_previous_start:=v_previous_end-v_days+1;

  with filtered_items as (
    select s.id sale_id,s.store_id,s.created_by,s.payment_method,s.created_at,si.product_id,
      si.quantity,si.line_total,si.purchase_price_snapshot*si.quantity as cost,si.gross_profit
    from sales s join sale_items si on si.sale_id=s.id join products p on p.id=si.product_id
    where s.company_id=v_company and s.created_at>=p_start_date::timestamptz and s.created_at<(p_end_date+1)::timestamptz
      and (p_store_id is null or s.store_id=p_store_id) and (p_employee_id is null or s.created_by=p_employee_id)
      and (p_product_id is null or si.product_id=p_product_id) and (p_category_id is null or p.category_id=p_category_id)
  ), previous_items as (
    select si.line_total,si.purchase_price_snapshot*si.quantity as cost,si.gross_profit
    from sales s join sale_items si on si.sale_id=s.id join products p on p.id=si.product_id
    where s.company_id=v_company and s.created_at>=v_previous_start::timestamptz and s.created_at<(v_previous_end+1)::timestamptz
      and (p_store_id is null or s.store_id=p_store_id) and (p_employee_id is null or s.created_by=p_employee_id)
      and (p_product_id is null or si.product_id=p_product_id) and (p_category_id is null or p.category_id=p_category_id)
  ), current_totals as (
    select coalesce(sum(line_total),0) revenue,coalesce(sum(cost),0) cost_of_goods,
      coalesce(sum(gross_profit),0) gross_profit,coalesce(sum(quantity),0) quantity_sold,count(distinct sale_id) sale_count from filtered_items
  ), previous_totals as (
    select coalesce(sum(line_total),0) revenue,coalesce(sum(cost),0) cost_of_goods,coalesce(sum(gross_profit),0) gross_profit from previous_items
  ), current_expenses as (
    select coalesce(sum(e.amount),0) amount from expenses e where e.company_id=v_company
      and e.expense_date between p_start_date and p_end_date and (p_store_id is null or e.store_id=p_store_id)
  ), previous_expenses as (
    select coalesce(sum(e.amount),0) amount from expenses e where e.company_id=v_company
      and e.expense_date between v_previous_start and v_previous_end and (p_store_id is null or e.store_id=p_store_id)
  ), top_products as (
    select p.id,p.name,sum(fi.quantity) quantity,sum(fi.line_total) revenue,sum(fi.gross_profit) gross_profit
    from filtered_items fi join products p on p.id=fi.product_id group by p.id,p.name order by sum(fi.gross_profit) desc limit 10
  ), payments as (
    select coalesce(payment_method,'unknown') name,sum(line_total) amount,count(distinct sale_id) count
    from filtered_items group by payment_method order by sum(line_total) desc
  ), stores_performance as (
    select st.id,st.name,sum(fi.line_total) revenue,sum(fi.gross_profit) gross_profit,count(distinct fi.sale_id) sales
    from filtered_items fi join stores st on st.id=fi.store_id group by st.id,st.name order by sum(fi.line_total) desc
  ), employees_performance as (
    select pr.id,coalesce(nullif(pr.full_name,''),'Employé') name,sum(fi.line_total) revenue,sum(fi.gross_profit) gross_profit,count(distinct fi.sale_id) sales
    from filtered_items fi join profiles pr on pr.id=fi.created_by group by pr.id,pr.full_name order by sum(fi.line_total) desc
  ), stock_value as (
    select coalesce(sum(sl.quantity*coalesce(v.purchase_price,p.purchase_price)),0) value
    from stock_levels sl join products p on p.id=sl.product_id left join product_variants v on v.id=sl.product_variant_id
    where sl.company_id=v_company and (p_store_id is null or sl.store_id=p_store_id)
      and (p_product_id is null or sl.product_id=p_product_id) and (p_category_id is null or p.category_id=p_category_id)
  )
  select jsonb_build_object(
    'startDate',p_start_date,'endDate',p_end_date,
    'revenue',ct.revenue,'costOfGoods',ct.cost_of_goods,'grossProfit',ct.gross_profit,
    'expenses',ce.amount,'netProfit',ct.gross_profit-ce.amount,'quantitySold',ct.quantity_sold,'saleCount',ct.sale_count,
    'stockValue',sv.value,
    'previous',jsonb_build_object('revenue',pt.revenue,'grossProfit',pt.gross_profit,'expenses',pe.amount,'netProfit',pt.gross_profit-pe.amount),
    'topProducts',coalesce((select jsonb_agg(to_jsonb(tp)) from top_products tp),'[]'::jsonb),
    'paymentMethods',coalesce((select jsonb_agg(to_jsonb(pm)) from payments pm),'[]'::jsonb),
    'stores',coalesce((select jsonb_agg(to_jsonb(sp)) from stores_performance sp),'[]'::jsonb),
    'employees',coalesce((select jsonb_agg(to_jsonb(ep)) from employees_performance ep),'[]'::jsonb)
  ) into v_result from current_totals ct,previous_totals pt,current_expenses ce,previous_expenses pe,stock_value sv;
  return v_result;
end $$;
grant execute on function public.get_report_filters() to authenticated;
grant execute on function public.get_business_report(date,date,uuid,uuid,uuid,uuid) to authenticated;
revoke all on function public.get_report_filters() from anon;
revoke all on function public.get_business_report(date,date,uuid,uuid,uuid,uuid) from anon;
