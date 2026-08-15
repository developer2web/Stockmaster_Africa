create table public.cash_closures (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  closure_date date not null default current_date,
  expected_amount numeric(14,2) not null,
  counted_amount numeric(14,2) not null check(counted_amount >= 0),
  difference numeric(14,2) generated always as (counted_amount - expected_amount) stored,
  note text,
  closed_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(store_id, closure_date)
);

alter table public.cash_closures enable row level security;
create policy cash_closures_read on public.cash_closures for select to authenticated
using(public.belongs_to_company(company_id) and public.can_access_store(company_id,store_id) and (public.has_permission(company_id,'cash_transactions.read') or public.has_permission(company_id,'expenses.read')));
revoke insert,update,delete on public.cash_closures from anon,authenticated;
grant select on public.cash_closures to authenticated;

create or replace function public.close_store_cash(p_store_id uuid,p_counted_amount numeric,p_note text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_company uuid;v_expected numeric;v_id uuid;
begin
  select company_id into v_company from stores where id=p_store_id;
  if v_company is null or not public.can_access_store(v_company,p_store_id) or not (public.has_permission(v_company,'cash_transactions.write') or public.has_permission(v_company,'expenses.write')) then raise exception 'Accès refusé';end if;
  if p_counted_amount<0 then raise exception 'Le montant compté ne peut pas être négatif';end if;
  select coalesce(sum(case when transaction_type='deposit' then amount else -amount end),0) into v_expected from cash_transactions where company_id=v_company and store_id=p_store_id;
  insert into cash_closures(company_id,store_id,expected_amount,counted_amount,note,closed_by)
  values(v_company,p_store_id,v_expected,p_counted_amount,nullif(trim(p_note),''),auth.uid()) returning id into v_id;
  insert into audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by) values(v_company,auth.uid(),'close_cash','cash_closures',v_id,jsonb_build_object('expected',v_expected,'counted',p_counted_amount,'difference',p_counted_amount-v_expected),auth.uid());
  return v_id;
exception when unique_violation then raise exception 'La caisse de cette boutique est déjà clôturée pour aujourd''hui';
end $$;

grant execute on function public.close_store_cash(uuid,numeric,text) to authenticated;
revoke all on function public.close_store_cash(uuid,numeric,text) from anon;
