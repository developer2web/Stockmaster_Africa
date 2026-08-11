create or replace function public.record_customer_entry(
  p_customer_id uuid,
  p_store_id uuid,
  p_entry_type text,
  p_amount numeric,
  p_note text default null,
  p_sale_id uuid default null,
  p_operation_id uuid default gen_random_uuid()
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_entry uuid;
begin
  if p_entry_type not in ('credit', 'payment') then
    raise exception 'Type d''écriture invalide';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Le montant doit être supérieur à zéro';
  end if;

  select c.company_id into v_company
  from public.customers c
  where c.id = p_customer_id;

  if v_company is null then
    raise exception 'Client invalide';
  end if;
  if not public.belongs_to_company(v_company)
     or not public.has_active_subscription(v_company)
     or not (public.is_company_admin(v_company) or public.has_permission(v_company, 'sales.write')) then
    raise exception 'Accès refusé ou abonnement inactif';
  end if;
  if p_store_id is not null and not exists (
    select 1 from public.stores s
    where s.id = p_store_id and s.company_id = v_company
  ) then
    raise exception 'Boutique invalide';
  end if;

  select id into v_entry
  from public.customer_ledger
  where operation_id = p_operation_id;
  if v_entry is not null then return v_entry; end if;

  insert into public.customer_ledger(
    company_id, customer_id, store_id, entry_type, amount,
    sale_id, note, operation_id, created_by
  ) values (
    v_company, p_customer_id, p_store_id, p_entry_type, p_amount,
    p_sale_id, nullif(trim(p_note), ''), p_operation_id, auth.uid()
  ) returning id into v_entry;

  return v_entry;
end
$$;

grant execute on function public.record_customer_entry(uuid, uuid, text, numeric, text, uuid, uuid) to authenticated;
revoke all on function public.record_customer_entry(uuid, uuid, text, numeric, text, uuid, uuid) from anon;
