-- Qualify the ledger column so PL/pgSQL does not confuse it with the output variable.

create or replace function public.create_sale_v2(
  p_store_id uuid,p_payment_method text,p_items jsonb,p_customer_id uuid default null,
  p_amount_paid numeric default null,p_operation_id uuid default gen_random_uuid()
) returns table(sale_id uuid,reference text,total numeric,gross_profit numeric,amount_paid numeric,amount_due numeric,payment_status text)
language plpgsql security definer set search_path=public as $$
declare result record;paid numeric;due numeric;status text;v_company uuid;v_allow_credit boolean;v_limit numeric;v_balance numeric;
begin
  select * into result from public.create_sale(p_store_id,p_payment_method,p_items,p_customer_id,p_operation_id);
  if p_payment_method='credit' then paid:=0;
  elsif p_payment_method='partial' then paid:=least(result.total,greatest(0,coalesce(p_amount_paid,0)));
  else paid:=result.total;end if;
  due:=result.total-paid;
  select s.company_id,c.allow_credit_sales into v_company,v_allow_credit from public.stores s join public.companies c on c.id=s.company_id where s.id=p_store_id;
  if due>0 and not coalesce(v_allow_credit,false) then raise exception 'Les ventes à crédit sont désactivées';end if;
  if due>0 and p_customer_id is null then raise exception 'Un client est obligatoire pour une vente avec dette';end if;
  if due>0 then
    select c.credit_limit,coalesce(cb.balance,0) into v_limit,v_balance from public.customers c
      left join public.customer_balances cb on cb.customer_id=c.id where c.id=p_customer_id and c.company_id=v_company for update of c;
    if v_limit is not null and v_balance+due>v_limit then
      raise exception 'Limite de crédit dépassée (limite: %, dette après vente: %)',v_limit,v_balance+due;
    end if;
  end if;
  status:=case when due=0 then 'paid' when paid=0 then 'credit' else 'partial' end;
  update public.sales s set amount_paid=paid,amount_due=due,payment_status=status where s.id=result.sale_id;
  if due>0 and not exists(select 1 from public.customer_ledger cl where cl.sale_id=result.sale_id and cl.entry_type='credit') then
    insert into public.customer_ledger(company_id,customer_id,store_id,entry_type,amount,sale_id,note,created_by)
    values(v_company,p_customer_id,p_store_id,'credit',due,result.sale_id,'Crédit vente '||result.reference,auth.uid());
  end if;
  sale_id:=result.sale_id;reference:=result.reference;total:=result.total;gross_profit:=result.gross_profit;
  amount_paid:=paid;amount_due:=due;payment_status:=status;return next;
end $$;

grant execute on function public.create_sale_v2(uuid,text,jsonb,uuid,numeric,uuid) to authenticated;
revoke all on function public.create_sale_v2(uuid,text,jsonb,uuid,numeric,uuid) from anon;
