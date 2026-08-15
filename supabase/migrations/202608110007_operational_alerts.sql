alter table public.customer_ledger add column if not exists due_date date;
alter table public.purchases add column if not exists due_date date;
update customer_ledger set due_date=(created_at::date+30) where entry_type='credit' and due_date is null;
update purchases set due_date=(created_at::date+30) where amount_due>0 and due_date is null;

create or replace function public.get_internal_notifications(p_store_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_company uuid;
begin
  select company_id into v_company from stores where id=p_store_id and is_active and public.can_access_store(company_id,id);if v_company is null then raise exception 'Boutique inaccessible';end if;
  return coalesce((select jsonb_agg(item order by (item->>'severity')::int desc,item->>'title') from (
    select jsonb_build_object('id','stock-'||sl.id,'type',case when sl.quantity<=0 then 'stock_out' else 'low_stock' end,'severity',case when sl.quantity<=0 then '3' else '2' end,'title',case when sl.quantity<=0 then 'Rupture de stock' else 'Stock faible' end,'body',p.name||' : '||sl.quantity||' '||p.unit) item from stock_levels sl join products p on p.id=sl.product_id where sl.company_id=v_company and sl.store_id=p_store_id and sl.quantity<=p.low_stock_threshold
    union all select jsonb_build_object('id','debt-'||c.id,'type','customer_debt','severity',case when min(l.due_date)<=current_date then '3' else '2' end,'title',case when min(l.due_date)<=current_date then 'Dette client échue' else 'Dette client' end,'body',c.name||' doit '||b.balance) from customer_balances b join customers c on c.id=b.customer_id left join customer_ledger l on l.customer_id=c.id and l.entry_type='credit' where b.company_id=v_company and b.balance>0 group by c.id,c.name,b.balance
    union all select jsonb_build_object('id','supplier-debt-'||s.id,'type','supplier_debt','severity',case when min(p.due_date)<=current_date then '3' else '2' end,'title',case when min(p.due_date)<=current_date then 'Dette fournisseur échue' else 'Dette fournisseur' end,'body',s.name||' : '||sum(p.amount_due)) from purchases p join suppliers s on s.id=p.supplier_id where p.company_id=v_company and p.store_id=p_store_id and p.amount_due>0 group by s.id,s.name
    union all select jsonb_build_object('id','cash-close-'||p_store_id,'type','cash_unclosed','severity','2','title','Caisse non clôturée','body','La caisse de cette boutique doit être comptée et clôturée aujourd''hui') where not exists(select 1 from cash_closures where store_id=p_store_id and closure_date=current_date)
  ) notifications(item)),'[]'::jsonb);
end $$;
