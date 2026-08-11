-- Une caisse appartient toujours à une boutique précise.
-- Les anciennes écritures sans boutique restent conservées pour l'audit,
-- mais les nouvelles opérations manuelles doivent cibler une boutique.
create index if not exists cash_transactions_company_store_created_idx
  on public.cash_transactions(company_id, store_id, created_at desc);
create or replace function public.record_cash_transaction(
  p_store_id uuid,
  p_transaction_type public.cash_transaction_type,
  p_designation text,
  p_amount numeric,
  p_operation_id uuid
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare v_company uuid;v_id uuid;
begin
  if p_store_id is null then
    raise exception 'Sélectionnez une boutique pour cette opération de caisse';
  end if;
  if length(trim(p_designation))<2 then raise exception 'Désignation requise'; end if;
  if p_amount<=0 then raise exception 'Le montant doit être positif'; end if;
  if p_operation_id is null then raise exception 'Clé d''idempotence requise'; end if;

  select m.company_id into v_company
  from memberships m
  join roles r on r.id=m.role_id
  join companies c on c.id=m.company_id
  join stores selected_store
    on selected_store.id=p_store_id
   and selected_store.company_id=m.company_id
   and selected_store.is_active
  where m.user_id=auth.uid() and m.is_active and c.is_active
    and (
      r.code='company_admin'
      or public.has_permission(m.company_id,'cash_transactions.write')
      or public.has_permission(m.company_id,'expenses.write')
    )
  limit 1;

  if v_company is null or not public.has_active_subscription(v_company) then
    raise exception 'Accès refusé';
  end if;
  if not exists(
    select 1 from stores
    where id=p_store_id and company_id=v_company and is_active
  ) or not public.can_access_store(v_company,p_store_id) then
    raise exception 'Boutique invalide ou non autorisée';
  end if;

  perform public.lock_operation(p_operation_id);

  if p_transaction_type='withdrawal' then
    select id into v_id from expenses
    where company_id=v_company and operation_id=p_operation_id;
    if v_id is not null then return v_id; end if;

    insert into expenses(
      company_id,store_id,label,amount,expense_date,operation_id,created_by
    ) values(
      v_company,p_store_id,trim(p_designation),p_amount,current_date,
      p_operation_id,auth.uid()
    ) returning id into v_id;
  else
    select id into v_id from cash_transactions
    where company_id=v_company and operation_id=p_operation_id;
    if v_id is not null then return v_id; end if;

    insert into cash_transactions(
      company_id,store_id,transaction_type,designation,amount,source,
      operation_id,created_by
    ) values(
      v_company,p_store_id,'deposit',trim(p_designation),p_amount,'manual',
      p_operation_id,auth.uid()
    ) returning id into v_id;
  end if;
  return v_id;
end
$$;
grant execute on function public.record_cash_transaction(
  uuid, public.cash_transaction_type, text, numeric, uuid
) to authenticated;
revoke all on function public.record_cash_transaction(
  uuid, public.cash_transaction_type, text, numeric, uuid
) from anon;
