-- Controlled supplier purchase cancellation with stock and cash compensation.

insert into public.permissions(code,description) values('purchases.cancel','Annuler un achat fournisseur')
on conflict(code) do update set description=excluded.description;

alter table public.purchases drop constraint if exists purchases_payment_status_check;
alter table public.purchases add constraint purchases_payment_status_check check(payment_status in ('paid','partial','due','cancelled'));
alter table public.purchases
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.profiles(id),
  add column if not exists cancellation_reason text,
  add column if not exists cancellation_refund_amount numeric(12,2) not null default 0 check(cancellation_refund_amount>=0);

create or replace function public.cancel_purchase(
  p_purchase_id uuid,p_reason text,p_refund_method text default 'cash',p_operation_id uuid default gen_random_uuid()
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_purchase public.purchases%rowtype;v_item record;v_available numeric;
begin
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Le motif d’annulation est obligatoire';end if;
  if p_refund_method not in ('cash','mobile_money') then raise exception 'Moyen de remboursement invalide';end if;
  select * into v_purchase from public.purchases where id=p_purchase_id for update;
  if v_purchase.id is null or not public.can_access_store(v_purchase.company_id,v_purchase.store_id)
     or not public.has_active_subscription(v_purchase.company_id)
     or not (public.is_company_admin(v_purchase.company_id) or public.has_permission(v_purchase.company_id,'purchases.cancel')) then
    raise exception 'Annulation de l’achat refusée';
  end if;
  if v_purchase.payment_status='cancelled' then return v_purchase.id;end if;
  if exists(select 1 from public.supplier_payment_allocations spa where spa.purchase_id=p_purchase_id) then
    raise exception 'Cet achat a reçu un règlement fournisseur. Annulez d’abord le règlement associé avec un administrateur';
  end if;
  perform public.lock_operation(p_operation_id);
  for v_item in select pi.product_id,pi.quantity from public.purchase_items pi where pi.purchase_id=p_purchase_id loop
    select quantity into v_available from public.stock_levels where company_id=v_purchase.company_id and store_id=v_purchase.store_id
      and product_id=v_item.product_id and product_variant_id is null for update;
    if coalesce(v_available,0)<v_item.quantity then raise exception 'Annulation impossible : une partie du stock acheté a déjà été vendue ou transférée';end if;
    update public.stock_levels set quantity=quantity-v_item.quantity,updated_at=now() where company_id=v_purchase.company_id
      and store_id=v_purchase.store_id and product_id=v_item.product_id and product_variant_id is null;
    insert into public.stock_movements(company_id,store_id,product_id,quantity,movement_type,operation_id,note,created_by)
      values(v_purchase.company_id,v_purchase.store_id,v_item.product_id,-v_item.quantity,'purchase_cancel',gen_random_uuid(),
        'Annulation achat '||p_purchase_id||' : '||trim(p_reason),auth.uid());
  end loop;
  if v_purchase.amount_paid>0 then
    insert into public.cash_transactions(company_id,store_id,transaction_type,designation,amount,source,payment_method,operation_id,created_by)
      values(v_purchase.company_id,v_purchase.store_id,'deposit','Remboursement annulation achat fournisseur',v_purchase.amount_paid,
        'purchase_cancel',p_refund_method,p_operation_id,auth.uid());
  end if;
  update public.purchases set payment_status='cancelled',amount_due=0,cancelled_at=now(),cancelled_by=auth.uid(),
    cancellation_reason=trim(p_reason),cancellation_refund_amount=amount_paid where id=p_purchase_id;
  insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by)
    values(v_purchase.company_id,auth.uid(),'cancel_purchase','purchases',p_purchase_id,jsonb_build_object('reason',trim(p_reason),
      'refund_amount',v_purchase.amount_paid,'refund_method',p_refund_method,'store_id',v_purchase.store_id),auth.uid());
  return p_purchase_id;
end $$;

grant execute on function public.cancel_purchase(uuid,text,text,uuid) to authenticated;
revoke all on function public.cancel_purchase(uuid,text,text,uuid) from anon;

create or replace function public.get_supplier_account_summary(p_store_id uuid,p_supplier_id uuid)
returns table(total numeric,paid numeric,due numeric)
language sql stable security definer set search_path=public as $$
  select coalesce(sum(p.total),0),coalesce(sum(p.amount_paid),0),coalesce(sum(p.amount_due),0)
  from public.purchases p where p.store_id=p_store_id and p.supplier_id=p_supplier_id and p.payment_status<>'cancelled'
    and public.belongs_to_company(p.company_id) and public.can_access_store(p.company_id,p.store_id)
    and (public.has_permission(p.company_id,'purchases.read') or public.has_permission(p.company_id,'suppliers.read'));
$$;
