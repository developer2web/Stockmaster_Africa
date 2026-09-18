begin;

-- Demande explicite du propriétaire (17/09) : « traçabilité financière
-- insuffisante » — ni référence de transaction pour les paiements clients
-- et fournisseurs, ni moyen de paiement capturé sur un approvisionnement
-- payé immédiatement (l'app supposait implicitement des espèces).

alter table public.supplier_payments add column if not exists reference text;
alter table public.customer_ledger add column if not exists reference text;
alter table public.purchases add column if not exists payment_method text
  check (payment_method is null or payment_method in ('cash','mobile_money','card','bank_transfer'));

drop function if exists public.record_purchase(uuid,uuid,jsonb,boolean,uuid,boolean);
drop function if exists public.record_supplier_payment(uuid,uuid,numeric,text,text,uuid);
drop function if exists public.record_customer_entry_v2(uuid,uuid,text,numeric,text,text,uuid,uuid);
drop function if exists public.cancel_purchase(uuid,text,text,uuid);

create or replace function public.record_purchase(p_store_id uuid, p_supplier_id uuid, p_items jsonb, p_paid boolean default true, p_operation_id uuid default gen_random_uuid(), p_confirm_negative boolean default false, p_payment_method text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_company uuid;v_purchase uuid;v_item jsonb;v_product uuid;v_quantity numeric;v_cost numeric;v_total numeric:=0;v_method text;
begin
  select company_id into v_company from stores where id=p_store_id and is_active and public.can_access_store(company_id,id);
  if v_company is null or not public.has_active_subscription(v_company) or not (public.has_permission(v_company,'stock_movements.write') or public.has_permission(v_company,'suppliers.write')) then raise exception 'Accès approvisionnement refusé';end if;
  if not exists(select 1 from suppliers where id=p_supplier_id and company_id=v_company and store_id=p_store_id and is_active) then raise exception 'Fournisseur invalide';end if;
  if p_paid and p_payment_method is not null and p_payment_method not in ('cash','mobile_money','card','bank_transfer') then raise exception 'Moyen de paiement invalide';end if;
  -- Rétrocompatible : un appelant qui ne connaît pas encore ce paramètre
  -- (aucun changement de comportement) obtient toujours "cash" par défaut.
  v_method:=case when p_paid then coalesce(p_payment_method,'cash') else null end;
  if p_confirm_negative and (public.is_company_admin(v_company) or public.has_permission(v_company,'cash_transactions.override_negative_balance')) then
    perform set_config('app.allow_negative_cash','true',true);
  end if;
  perform public.lock_operation(p_operation_id);
  select id into v_purchase from purchases where operation_id=p_operation_id;
  if v_purchase is not null then return v_purchase;end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Ajoutez au moins un produit';end if;
  v_purchase:=gen_random_uuid();
  insert into purchases(id,company_id,supplier_id,store_id,total,amount_paid,amount_due,operation_id,payment_status,payment_method,created_by) values(v_purchase,v_company,p_supplier_id,p_store_id,0,0,0,p_operation_id,case when p_paid then 'paid' else 'due' end,v_method,auth.uid());
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_product:=(v_item->>'productId')::uuid;v_quantity:=(v_item->>'quantity')::numeric;v_cost:=(v_item->>'unitCost')::numeric;
    if v_quantity<=0 or v_cost<=0 or not exists(select 1 from products where id=v_product and company_id=v_company and store_id=p_store_id and is_active) then raise exception 'Ligne approvisionnement invalide';end if;
    insert into purchase_items(company_id,purchase_id,product_id,quantity,unit_cost,created_by) values(v_company,v_purchase,v_product,v_quantity,v_cost,auth.uid());
    insert into stock_levels(company_id,store_id,product_id,product_variant_id,quantity,created_by) values(v_company,p_store_id,v_product,null,v_quantity,auth.uid()) on conflict(company_id,store_id,product_id,product_variant_id) do update set quantity=stock_levels.quantity+excluded.quantity,updated_at=now();
    insert into stock_movements(company_id,store_id,product_id,quantity,movement_type,operation_id,note,created_by) values(v_company,p_store_id,v_product,v_quantity,'purchase',gen_random_uuid(),'Approvisionnement '||v_purchase,auth.uid());
    update products set purchase_price=v_cost where id=v_product;
    v_total:=v_total+v_quantity*v_cost;
  end loop;
  update purchases set total=v_total,amount_paid=case when p_paid then v_total else 0 end,amount_due=case when p_paid then 0 else v_total end where id=v_purchase;
  if p_paid and v_total>0 then insert into cash_transactions(company_id,store_id,transaction_type,designation,amount,source,payment_method,operation_id,created_by) values(v_company,p_store_id,'withdrawal','Approvisionnement fournisseur',v_total,'purchase',v_method,p_operation_id,auth.uid());end if;
  return v_purchase;
end
$function$;

create or replace function public.record_supplier_payment(p_store_id uuid, p_supplier_id uuid, p_amount numeric, p_payment_method text, p_note text default null, p_operation_id uuid default gen_random_uuid(), p_reference text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_company uuid;v_payment uuid;v_cash uuid;v_total_due numeric;v_remaining numeric;v_allocate numeric;v_purchase record;v_supplier_name text;
begin
  if p_operation_id is null or p_amount is null or p_amount<=0 then raise exception 'Montant ou identifiant invalide';end if;
  if p_payment_method not in ('cash','mobile_money','card','bank_transfer') then raise exception 'Moyen de paiement invalide';end if;
  select company_id,name into v_company,v_supplier_name from suppliers where id=p_supplier_id and store_id=p_store_id and is_active;
  if v_company is null or not public.belongs_to_company(v_company) or not public.can_access_store(v_company,p_store_id) or not public.has_active_subscription(v_company) or not (public.is_business_owner(v_company) or public.has_permission(v_company,'purchases.read') or public.has_permission(v_company,'suppliers.write')) or not (public.is_business_owner(v_company) or public.has_permission(v_company,'cash_transactions.write') or public.has_permission(v_company,'expenses.write')) then raise exception 'Accès au règlement fournisseur refusé';end if;
  perform public.lock_operation(p_operation_id);
  perform pg_advisory_xact_lock(hashtextextended(p_supplier_id::text,0));
  select id into v_payment from supplier_payments where company_id=v_company and operation_id=p_operation_id;if v_payment is not null then return v_payment;end if;
  select coalesce(sum(amount_due),0) into v_total_due from purchases where company_id=v_company and store_id=p_store_id and supplier_id=p_supplier_id and amount_due>0;
  if v_total_due<=0 then raise exception 'Ce fournisseur n''a aucune dette à régler';end if;
  if p_amount>v_total_due then raise exception 'Le paiement dépasse la dette fournisseur restante (%)',v_total_due;end if;
  insert into cash_transactions(company_id,store_id,transaction_type,designation,amount,source,payment_method,operation_id,created_by) values(v_company,p_store_id,'withdrawal','Paiement fournisseur '||v_supplier_name,p_amount,'supplier_payment',p_payment_method,p_operation_id,auth.uid()) returning id into v_cash;
  insert into supplier_payments(company_id,store_id,supplier_id,amount,payment_method,note,reference,operation_id,cash_transaction_id,created_by,balance_before,balance_after) values(v_company,p_store_id,p_supplier_id,p_amount,p_payment_method,nullif(trim(p_note),''),nullif(trim(p_reference),''),p_operation_id,v_cash,auth.uid(),v_total_due,v_total_due-p_amount) returning id into v_payment;
  v_remaining:=p_amount;
  for v_purchase in select id,amount_due from purchases where company_id=v_company and store_id=p_store_id and supplier_id=p_supplier_id and amount_due>0 order by created_at,id for update loop
    exit when v_remaining<=0;v_allocate:=least(v_remaining,v_purchase.amount_due);
    insert into supplier_payment_allocations(company_id,supplier_payment_id,purchase_id,amount) values(v_company,v_payment,v_purchase.id,v_allocate);
    update purchases set amount_paid=amount_paid+v_allocate,amount_due=amount_due-v_allocate,payment_status=case when amount_due-v_allocate=0 then 'paid' else 'partial' end where id=v_purchase.id;
    v_remaining:=v_remaining-v_allocate;
  end loop;
  return v_payment;
end
$function$;

create or replace function public.record_customer_entry_v2(
  p_customer_id uuid,p_store_id uuid,p_entry_type text,p_amount numeric,p_payment_method text default null,
  p_note text default null,p_sale_id uuid default null,p_operation_id uuid default gen_random_uuid(),p_reference text default null
) returns uuid language plpgsql security definer set search_path=public as $function$
declare v_company uuid;v_entry uuid;v_before numeric;v_after numeric;v_remaining numeric;v_allocate numeric;v_sale record;v_customer text;
begin
  if p_entry_type not in ('credit','payment','discount') then raise exception 'Type d’écriture invalide';end if;
  if p_amount is null or p_amount<=0 then raise exception 'Le montant doit être supérieur à zéro';end if;
  select company_id,name into v_company,v_customer from public.customers where id=p_customer_id and is_active;
  if v_company is null or not public.belongs_to_company(v_company) or not public.has_active_subscription(v_company)
     or not (public.is_company_admin(v_company) or public.has_permission(v_company,'sales.write')) then raise exception 'Accès refusé ou abonnement inactif';end if;
  if p_store_id is null or not exists(select 1 from public.stores where id=p_store_id and company_id=v_company and public.can_access_store(v_company,id)) then raise exception 'Boutique invalide';end if;
  if p_entry_type='discount' and not public.is_company_admin(v_company) then raise exception 'Seul un administrateur peut accorder une remise de dette';end if;
  if p_entry_type='discount' and length(trim(coalesce(p_note,'')))<3 then raise exception 'Le motif de la remise est obligatoire';end if;
  if p_entry_type='payment' and p_payment_method not in ('cash','mobile_money') then raise exception 'Moyen de paiement invalide';end if;
  perform public.lock_operation(p_operation_id);perform pg_advisory_xact_lock(hashtextextended(p_customer_id::text,0));
  select id into v_entry from public.customer_ledger where operation_id=p_operation_id;if v_entry is not null then return v_entry;end if;
  select coalesce(sum(case when entry_type='credit' then amount else -amount end),0) into v_before from public.customer_ledger where customer_id=p_customer_id;
  if p_entry_type in ('payment','discount') and p_amount>v_before then raise exception 'Le montant dépasse la dette restante (%)',v_before;end if;
  v_after:=v_before+case when p_entry_type='credit' then p_amount else -p_amount end;
  insert into public.customer_ledger(company_id,customer_id,store_id,entry_type,amount,sale_id,note,reference,operation_id,created_by,balance_before,balance_after,payment_method)
    values(v_company,p_customer_id,p_store_id,p_entry_type,p_amount,p_sale_id,nullif(trim(p_note),''),nullif(trim(p_reference),''),p_operation_id,auth.uid(),v_before,v_after,
      case when p_entry_type='payment' then p_payment_method else null end) returning id into v_entry;
  if p_entry_type='payment' then
    insert into public.cash_transactions(company_id,store_id,transaction_type,designation,amount,source,payment_method,operation_id,created_by)
      values(v_company,p_store_id,'deposit','Paiement client '||v_customer,p_amount,'customer_payment',p_payment_method,p_operation_id,auth.uid());
  end if;
  if p_entry_type in ('payment','discount') then
    perform set_config('stockmaster.debt_settlement','1',true);
    v_remaining:=p_amount;
    for v_sale in select id,amount_due from public.sales where company_id=v_company and customer_id=p_customer_id and amount_due>0
      order by created_at,id for update loop
      exit when v_remaining<=0;v_allocate:=least(v_remaining,v_sale.amount_due);
      insert into public.customer_payment_allocations(company_id,ledger_entry_id,sale_id,amount) values(v_company,v_entry,v_sale.id,v_allocate);
      update public.sales set amount_due=amount_due-v_allocate,amount_paid=amount_paid+case when p_entry_type='payment' then v_allocate else 0 end,
        payment_status=case when amount_due-v_allocate=0 then 'paid' else 'partial' end where id=v_sale.id;
      v_remaining:=v_remaining-v_allocate;
    end loop;
  end if;
  insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by)
    values(v_company,auth.uid(),case p_entry_type when 'payment' then 'customer_debt_payment' when 'discount' then 'customer_debt_discount' else 'customer_debt_add' end,
      'customer_ledger',v_entry,jsonb_build_object('customer_id',p_customer_id,'amount',p_amount,'balance_before',v_before,'balance_after',v_after,
      'payment_method',p_payment_method,'reason',p_note),auth.uid());
  return v_entry;
end
$function$;

create or replace function public.cancel_purchase(p_purchase_id uuid, p_reason text, p_refund_method text default null, p_operation_id uuid default gen_random_uuid(), p_refund_reference text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_purchase public.purchases%rowtype;v_item record;v_available numeric;v_method text;
begin
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Le motif d’annulation est obligatoire';end if;
  select * into v_purchase from public.purchases where id=p_purchase_id for update;
  if v_purchase.id is null or not public.can_access_store(v_purchase.company_id,v_purchase.store_id)
     or not public.has_active_subscription(v_purchase.company_id)
     or not (public.is_company_admin(v_purchase.company_id) or public.has_permission(v_purchase.company_id,'purchases.cancel')) then
    raise exception 'Annulation de l’achat refusée';
  end if;
  if v_purchase.payment_status='cancelled' then return v_purchase.id;end if;
  -- Par défaut, rembourse par le même moyen que le paiement d'origine
  -- (capturé depuis le 18/09) plutôt que de supposer "cash" sans le dire ;
  -- reste modifiable si le remboursement se fait réellement autrement.
  v_method:=coalesce(p_refund_method,v_purchase.payment_method,'cash');
  if v_method not in ('cash','mobile_money') then raise exception 'Moyen de remboursement invalide';end if;
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
        'purchase_cancel',v_method,p_operation_id,auth.uid());
  end if;
  update public.purchases set payment_status='cancelled',amount_due=0,cancelled_at=now(),cancelled_by=auth.uid(),
    cancellation_reason=trim(p_reason),cancellation_refund_amount=amount_paid where id=p_purchase_id;
  insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by)
    values(v_purchase.company_id,auth.uid(),'cancel_purchase','purchases',p_purchase_id,jsonb_build_object('reason',trim(p_reason),
      'refund_amount',v_purchase.amount_paid,'refund_method',v_method,'refund_reference',p_refund_reference,'store_id',v_purchase.store_id),auth.uid());
  return p_purchase_id;
end
$function$;

grant execute on function public.record_purchase(uuid,uuid,jsonb,boolean,uuid,boolean,text) to authenticated;
grant execute on function public.record_supplier_payment(uuid,uuid,numeric,text,text,uuid,text) to authenticated;
grant execute on function public.record_customer_entry_v2(uuid,uuid,text,numeric,text,text,uuid,uuid,text) to authenticated;
grant execute on function public.cancel_purchase(uuid,text,text,uuid,text) to authenticated;
revoke all on function public.record_purchase(uuid,uuid,jsonb,boolean,uuid,boolean,text) from anon;
revoke all on function public.record_supplier_payment(uuid,uuid,numeric,text,text,uuid,text) from anon;
revoke all on function public.record_customer_entry_v2(uuid,uuid,text,numeric,text,text,uuid,uuid,text) from anon;
revoke all on function public.cancel_purchase(uuid,text,text,uuid,text) from anon;

commit;
