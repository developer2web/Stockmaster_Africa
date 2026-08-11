create or replace function public.get_internal_notifications(p_store_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_company uuid;
begin
  select company_id into v_company from stores where id=p_store_id and is_active and public.can_access_store(company_id,id);
  if v_company is null then raise exception 'Boutique inaccessible';end if;
  return coalesce((select jsonb_agg(item order by item->>'severity' desc,item->>'title') from (
    select jsonb_build_object('id','stock-'||sl.id,'type',case when sl.quantity<=0 then 'stock_out' else 'low_stock' end,'severity',case when sl.quantity<=0 then '3' else '2' end,'title',case when sl.quantity<=0 then 'Rupture de stock' else 'Stock faible' end,'body',p.name||' : '||sl.quantity||' '||p.unit) item from stock_levels sl join products p on p.id=sl.product_id where sl.company_id=v_company and sl.store_id=p_store_id and sl.quantity<=p.low_stock_threshold
    union all
    select jsonb_build_object('id','debt-'||c.id,'type','customer_debt','severity','2','title','Dette client','body',c.name||' doit '||b.balance) from customer_balances b join customers c on c.id=b.customer_id where b.company_id=v_company and b.balance>0
    union all
    select jsonb_build_object('id','purchase-'||p.id,'type','purchase','severity','1','title','Approvisionnement enregistré','body',coalesce(s.name,'Fournisseur')||' - '||p.total) from purchases p left join suppliers s on s.id=p.supplier_id where p.company_id=v_company and p.store_id=p_store_id and p.created_at>=now()-interval '7 days'
  ) notifications(item)),'[]'::jsonb);
end $$;
grant execute on function public.get_internal_notifications(uuid) to authenticated;
revoke all on function public.get_internal_notifications(uuid) from anon;
