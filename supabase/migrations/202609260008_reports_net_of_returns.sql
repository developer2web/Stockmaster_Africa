begin;

-- Audit du 26/09 : les rapports (et « Ventes du jour » du tableau de bord, qui en
-- reprend le chiffre d'affaires) ignoraient les retours. Chiffre d'affaires, coût
-- des ventes, marge, bénéfice net, quantités et répartitions (produits, paiements,
-- boutiques, employés) sont désormais nets des retours, à la date du retour.
-- Seule modification par rapport à la version en base (relue le 26/09) : les retours ajoutés en lignes
-- négatives, et le nombre de ventes qui ne compte pas les retours.

create or replace function public.get_business_report_with_financials(p_start_date date, p_end_date date, p_store_id uuid DEFAULT NULL::uuid, p_employee_id uuid DEFAULT NULL::uuid, p_product_id uuid DEFAULT NULL::uuid, p_category_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if p_store_id is null then
    if not v_can_all_stores then raise exception 'Sélectionnez une boutique pour afficher le rapport'; end if;
    perform public.require_feature(v_company,'consolidated_reports');
  else
    if not public.can_access_store(v_company,p_store_id) then
      raise exception 'Cette boutique ne vous est pas attribuée';
    end if;
  end if;
  if p_store_id is not null and not exists(select 1 from stores where id=p_store_id and company_id=v_company) then raise exception 'Boutique invalide'; end if;
  if p_employee_id is not null and not exists(select 1 from memberships where user_id=p_employee_id and company_id=v_company and is_active) then raise exception 'Employé invalide'; end if;
  if p_product_id is not null and not exists(select 1 from products where id=p_product_id and company_id=v_company) then raise exception 'Produit invalide'; end if;
  if p_category_id is not null and not exists(select 1 from categories where id=p_category_id and company_id=v_company) then raise exception 'Catégorie invalide'; end if;

  v_days:=p_end_date-p_start_date+1;
  v_previous_end:=p_start_date-1;
  v_previous_start:=v_previous_end-v_days+1;

  with filtered_items as (
    select false is_return,s.id sale_id,s.store_id,s.created_by,s.payment_method,s.created_at,si.product_id,
      si.quantity,si.line_total,si.purchase_price_snapshot*si.quantity as cost,si.gross_profit
    from sales s join sale_items si on si.sale_id=s.id join products p on p.id=si.product_id
    where s.company_id=v_company and s.created_at>=p_start_date::timestamptz and s.created_at<(p_end_date+1)::timestamptz
      and (p_store_id is null or s.store_id=p_store_id) and (p_employee_id is null or s.created_by=p_employee_id)
      and (p_product_id is null or si.product_id=p_product_id) and (p_category_id is null or p.category_id=p_category_id)
    union all
    -- Retours, comptés en négatif à la date du retour (audit du 26/09 : ils étaient ignorés,
    -- d'où un chiffre d'affaires et un bénéfice surévalués). Le coût d'achat n'est repris que
    -- si l'article revient en stock ; abîmé ou perdu, il reste une perte.
    select true,s.id,s.store_id,s.created_by,s.payment_method,r.created_at,ri.product_id,
      -ri.quantity,-ri.refund_amount,
      case when ri.disposition='restock' then -(si.purchase_price_snapshot*ri.quantity) else 0 end,
      -ri.refund_amount+case when ri.disposition='restock' then si.purchase_price_snapshot*ri.quantity else 0 end
    from sale_returns r join sale_return_items ri on ri.return_id=r.id join sale_items si on si.id=ri.sale_item_id
      join sales s on s.id=r.sale_id join products p on p.id=ri.product_id
    where r.company_id=v_company and r.created_at>=p_start_date::timestamptz and r.created_at<(p_end_date+1)::timestamptz
      and (p_store_id is null or s.store_id=p_store_id) and (p_employee_id is null or s.created_by=p_employee_id)
      and (p_product_id is null or ri.product_id=p_product_id) and (p_category_id is null or p.category_id=p_category_id)
  ), previous_items as (
    select si.line_total,si.purchase_price_snapshot*si.quantity as cost,si.gross_profit
    from sales s join sale_items si on si.sale_id=s.id join products p on p.id=si.product_id
    where s.company_id=v_company and s.created_at>=v_previous_start::timestamptz and s.created_at<(v_previous_end+1)::timestamptz
      and (p_store_id is null or s.store_id=p_store_id) and (p_employee_id is null or s.created_by=p_employee_id)
      and (p_product_id is null or si.product_id=p_product_id) and (p_category_id is null or p.category_id=p_category_id)
    union all
    select -ri.refund_amount,
      case when ri.disposition='restock' then -(si.purchase_price_snapshot*ri.quantity) else 0 end,
      -ri.refund_amount+case when ri.disposition='restock' then si.purchase_price_snapshot*ri.quantity else 0 end
    from sale_returns r join sale_return_items ri on ri.return_id=r.id join sale_items si on si.id=ri.sale_item_id
      join sales s on s.id=r.sale_id join products p on p.id=ri.product_id
    where r.company_id=v_company and r.created_at>=v_previous_start::timestamptz and r.created_at<(v_previous_end+1)::timestamptz
      and (p_store_id is null or s.store_id=p_store_id) and (p_employee_id is null or s.created_by=p_employee_id)
      and (p_product_id is null or ri.product_id=p_product_id) and (p_category_id is null or p.category_id=p_category_id)
  ), current_totals as (
    select coalesce(sum(line_total),0) revenue,coalesce(sum(cost),0) cost_of_goods,
      coalesce(sum(gross_profit),0) gross_profit,coalesce(sum(quantity),0) quantity_sold,count(distinct sale_id) filter (where not is_return) sale_count from filtered_items
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
    select coalesce(payment_method,'unknown') name,sum(line_total) amount,count(distinct sale_id) filter (where not fi.is_return) count
    from filtered_items fi group by payment_method order by sum(line_total) desc
  ), stores_performance as (
    select st.id,st.name,sum(fi.line_total) revenue,sum(fi.gross_profit) gross_profit,count(distinct fi.sale_id) filter (where not fi.is_return) sales
    from filtered_items fi join stores st on st.id=fi.store_id group by st.id,st.name order by sum(fi.line_total) desc
  ), employees_performance as (
    select pr.id,coalesce(nullif(pr.full_name,''),'Employé') name,sum(fi.line_total) revenue,sum(fi.gross_profit) gross_profit,count(distinct fi.sale_id) filter (where not fi.is_return) sales
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
end $function$;

commit;
