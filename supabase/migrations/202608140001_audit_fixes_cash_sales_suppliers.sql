-- Fixes from the full runtime/finance audit.

create or replace function public.get_store_cash_summary(p_store_id uuid)
returns table(deposits numeric, withdrawals numeric, balance numeric)
language plpgsql stable security definer set search_path=public as $$
declare v_company uuid; v_opening public.cash_openings%rowtype; v_base numeric:=0; v_since timestamptz;
begin
  select company_id into v_company from public.stores where id=p_store_id;
  if v_company is null or not public.can_access_store(v_company,p_store_id) then raise exception 'Accès refusé'; end if;
  select co.* into v_opening from public.cash_openings co
    where co.store_id=p_store_id order by co.created_at desc limit 1;
  if v_opening.id is not null then v_base:=v_opening.counted_amount; v_since:=v_opening.created_at; end if;
  return query select
    coalesce(sum(ct.amount) filter(where ct.transaction_type='deposit'),0),
    coalesce(sum(ct.amount) filter(where ct.transaction_type='withdrawal'),0),
    v_base+coalesce(sum(case when ct.transaction_type='deposit' then ct.amount else -ct.amount end),0)
  from public.cash_transactions ct where ct.store_id=p_store_id
    and (v_since is null or ct.created_at>v_since);
end $$;

create or replace function public.close_store_cash(p_store_id uuid,p_counted_amount numeric,p_note text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_company uuid;v_expected numeric;v_id uuid;v_label text;v_latest uuid;v_opening public.cash_openings%rowtype;v_base numeric:=0;v_since timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('cash-close:'||p_store_id::text,0));
  select company_id into v_company from public.stores where id=p_store_id;
  if v_company is null or not public.can_access_store(v_company,p_store_id) or not (public.has_permission(v_company,'cash_transactions.write') or public.has_permission(v_company,'expenses.write')) then raise exception 'Accès refusé';end if;
  if p_counted_amount is null or p_counted_amount<0 then raise exception 'Le montant compté ne peut pas être négatif';end if;
  select id into v_latest from public.cash_closures where store_id=p_store_id order by created_at desc,id desc limit 1;
  if v_latest is not null and not exists(select 1 from public.cash_openings where last_closure_id=v_latest) then raise exception 'Validez d’abord le montant initial de cette reprise';end if;
  select co.* into v_opening from public.cash_openings co where co.store_id=p_store_id order by co.created_at desc,co.id desc limit 1;
  if v_opening.id is not null then v_base:=v_opening.counted_amount;v_since:=v_opening.created_at;end if;
  select v_base+coalesce(sum(case when transaction_type='deposit' then amount else -amount end),0) into v_expected
    from public.cash_transactions where company_id=v_company and store_id=p_store_id and (v_since is null or created_at>v_since);
  select case when r.code='company_admin' then 'Administrateur' else coalesce(nullif(trim(p.full_name),''),'Employé') end into v_label from public.memberships m join public.roles r on r.id=m.role_id join public.profiles p on p.id=m.user_id where m.user_id=auth.uid() and m.company_id=v_company and m.is_active order by case when r.code='company_admin' then 0 else 1 end limit 1;
  insert into public.cash_closures(company_id,store_id,expected_amount,counted_amount,note,closed_by,closed_by_label) values(v_company,p_store_id,v_expected,p_counted_amount,nullif(trim(p_note),''),auth.uid(),coalesce(v_label,'Employé')) returning id into v_id;
  insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by) values(v_company,auth.uid(),'close_cash','cash_closures',v_id,jsonb_build_object('expected',v_expected,'counted',p_counted_amount,'difference',p_counted_amount-v_expected,'closed_by',v_label,'opening_id',v_opening.id),auth.uid());
  return v_id;
end $$;

create or replace function public.require_open_cash_for_sale()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_closure uuid;
begin
  select id into v_closure from public.cash_closures where store_id=new.store_id order by created_at desc,id desc limit 1;
  if v_closure is not null and not exists(select 1 from public.cash_openings where last_closure_id=v_closure) then
    raise exception 'Validez le montant initial de la caisse avant toute vente';
  end if;
  return new;
end $$;
drop trigger if exists require_open_cash_for_sale on public.sales;
create trigger require_open_cash_for_sale before insert on public.sales for each row execute function public.require_open_cash_for_sale();

create or replace function public.get_supplier_account_summary(p_store_id uuid,p_supplier_id uuid)
returns table(total numeric,paid numeric,due numeric)
language sql stable security definer set search_path=public as $$
  select coalesce(sum(p.total),0),coalesce(sum(p.amount_paid),0),coalesce(sum(p.amount_due),0)
  from public.purchases p where p.store_id=p_store_id and p.supplier_id=p_supplier_id
    and public.belongs_to_company(p.company_id) and public.can_access_store(p.company_id,p.store_id)
    and (public.has_permission(p.company_id,'purchases.read') or public.has_permission(p.company_id,'suppliers.read'));
$$;

create or replace function public.get_customer_sales_safe(p_company_id uuid,p_customer_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'reference',s.reference,'total',s.total,
    'payment_method',s.payment_method,'created_at',s.created_at,'store',jsonb_build_object('name',st.name)) order by s.created_at desc),'[]'::jsonb)
  from public.sales s join public.stores st on st.id=s.store_id
  where s.company_id=p_company_id and s.customer_id=p_customer_id and public.belongs_to_company(s.company_id)
    and public.can_access_store(s.company_id,s.store_id) and public.has_permission(s.company_id,'sales.read');
$$;

create or replace function public.get_dashboard_trends_safe(p_company_id uuid,p_store_id uuid,p_start timestamptz)
returns jsonb language sql stable security definer set search_path=public as $$
  with allowed_sales as (
    select s.id,s.total,s.created_at from public.sales s where s.company_id=p_company_id and s.store_id=p_store_id
      and s.created_at>=p_start and public.belongs_to_company(s.company_id) and public.can_access_store(s.company_id,s.store_id)
      and public.has_permission(s.company_id,'sales.read')
  ), products as (
    select p.name,sum(si.quantity) quantity from public.sale_items si join allowed_sales s on s.id=si.sale_id
    join public.products p on p.id=si.product_id group by p.id,p.name order by sum(si.quantity) desc limit 5
  ) select jsonb_build_object('sales',coalesce((select jsonb_agg(jsonb_build_object('id',id,'total',total,'created_at',created_at)) from allowed_sales),'[]'::jsonb),
    'topProducts',coalesce((select jsonb_agg(jsonb_build_object('name',name,'quantity',quantity)) from products),'[]'::jsonb));
$$;

create or replace function public.get_financial_sales_safe(p_company_id uuid,p_start timestamptz,p_end timestamptz,p_store_id uuid default null)
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'reference',s.reference,'created_at',s.created_at,
    'total',s.total,'payment_method',s.payment_method,'store',jsonb_build_object('name',st.name)) order by s.created_at desc),'[]'::jsonb)
  from public.sales s join public.stores st on st.id=s.store_id
  where s.company_id=p_company_id and s.created_at between p_start and p_end
    and (p_store_id is null or s.store_id=p_store_id) and public.belongs_to_company(s.company_id)
    and public.can_access_store(s.company_id,s.store_id) and public.is_company_admin(s.company_id);
$$;

grant execute on function public.get_supplier_account_summary(uuid,uuid) to authenticated;
grant execute on function public.get_customer_sales_safe(uuid,uuid) to authenticated;
grant execute on function public.get_dashboard_trends_safe(uuid,uuid,timestamptz) to authenticated;
grant execute on function public.get_financial_sales_safe(uuid,timestamptz,timestamptz,uuid) to authenticated;
revoke all on function public.get_supplier_account_summary(uuid,uuid) from anon;
revoke all on function public.get_customer_sales_safe(uuid,uuid) from anon;
revoke all on function public.get_dashboard_trends_safe(uuid,uuid,timestamptz) from anon;
revoke all on function public.get_financial_sales_safe(uuid,timestamptz,timestamptz,uuid) from anon;
