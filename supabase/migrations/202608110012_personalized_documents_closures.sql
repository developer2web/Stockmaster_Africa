alter table public.cash_closures add column if not exists closed_by_label text;

update public.cash_closures cc set closed_by_label=case when exists(select 1 from memberships m join roles r on r.id=m.role_id where m.user_id=cc.closed_by and m.company_id=cc.company_id and r.code='company_admin') then 'Administrateur' else coalesce((select nullif(trim(p.full_name),'') from profiles p where p.id=cc.closed_by),'Employe') end where closed_by_label is null;
alter table public.cash_closures alter column closed_by_label set not null;

create or replace function public.close_store_cash(p_store_id uuid,p_counted_amount numeric,p_note text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_company uuid;v_expected numeric;v_id uuid;v_label text;
begin
  select company_id into v_company from stores where id=p_store_id;
  if v_company is null or not public.can_access_store(v_company,p_store_id) or not (public.has_permission(v_company,'cash_transactions.write') or public.has_permission(v_company,'expenses.write')) then raise exception 'Acces refuse';end if;
  if p_counted_amount<0 then raise exception 'Le montant compte ne peut pas etre negatif';end if;
  select case when r.code='company_admin' then 'Administrateur' else coalesce(nullif(trim(p.full_name),''),'Employe') end into v_label from memberships m join roles r on r.id=m.role_id join profiles p on p.id=m.user_id where m.user_id=auth.uid() and m.company_id=v_company and m.is_active order by case when r.code='company_admin' then 0 else 1 end limit 1;
  select coalesce(sum(case when transaction_type='deposit' then amount else -amount end),0) into v_expected from cash_transactions where company_id=v_company and store_id=p_store_id;
  insert into cash_closures(company_id,store_id,expected_amount,counted_amount,note,closed_by,closed_by_label) values(v_company,p_store_id,v_expected,p_counted_amount,nullif(trim(p_note),''),auth.uid(),coalesce(v_label,'Employe')) returning id into v_id;
  insert into audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by) values(v_company,auth.uid(),'close_cash','cash_closures',v_id,jsonb_build_object('expected',v_expected,'counted',p_counted_amount,'difference',p_counted_amount-v_expected,'closed_by',v_label),auth.uid());
  return v_id;
exception when unique_violation then raise exception 'La caisse de cette boutique est deja cloturee pour aujourd''hui';
end $$;
