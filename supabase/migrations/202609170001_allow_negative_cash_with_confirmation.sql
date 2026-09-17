begin;

-- Demande explicite du propriétaire (17/09), en réaction directe à SM-01
-- (audit externe) : le blocage strict posé la veille (aucune écriture ne
-- peut jamais faire passer la caisse sous zéro, sans exception) est
-- assoupli — mais uniquement pour le propriétaire et un rôle "Manager",
-- et uniquement après confirmation explicite côté client. Un employé
-- simple reste bloqué sans recours, exactement comme avant.

insert into public.permissions(code, description) values
  ('cash_transactions.override_negative_balance', 'Faire passer la caisse en négatif après confirmation')
on conflict (code) do nothing;

-- Rattrape les entreprises qui ont déjà créé un rôle "Manager" depuis le
-- modèle intégré de l'app (roles.tsx) avant l'ajout de cette permission —
-- sans ça, seuls les nouveaux rôles "Manager" créés après ce correctif
-- l'auraient. Comparaison insensible à la casse sur le nom du rôle
-- (donnée saisie par chaque entreprise, pas un code interne).
insert into public.role_permissions(company_id, role_id, permission_id)
select r.company_id, r.id, p.id
from public.roles r
cross join public.permissions p
where p.code = 'cash_transactions.override_negative_balance'
  and lower(trim(r.name)) = 'manager'
on conflict (role_id, permission_id) do nothing;

-- Le trigger reste l'unique endroit qui décide, mais honore maintenant un
-- drapeau local à la transaction posé par les fonctions ci-dessous — jamais
-- par le client directement (ce n'est pas un paramètre de la table, rien
-- qu'un appel RPC ne peut positionner sans passer par les vérifications de
-- permission qu'elles contiennent).
create or replace function public.guard_cash_balance_not_negative()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_base numeric := 0;
  v_since timestamptz;
  v_balance_excluding numeric;
begin
  if new.transaction_type <> 'withdrawal' or new.store_id is null then
    return new;
  end if;
  if coalesce(current_setting('app.allow_negative_cash', true), '') = 'true' then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.store_id::text, 1));

  select co.counted_amount, co.created_at into v_base, v_since
    from public.cash_openings co where co.store_id = new.store_id
    order by co.created_at desc limit 1;
  v_base := coalesce(v_base, 0);

  select v_base + coalesce(sum(case when ct.transaction_type = 'deposit' then ct.amount else -ct.amount end), 0)
    into v_balance_excluding
    from public.cash_transactions ct
    where ct.store_id = new.store_id
      and (v_since is null or ct.created_at > v_since)
      and ct.id is distinct from new.id;

  if v_balance_excluding - new.amount < 0 then
    raise exception 'Cette opération ferait passer la caisse en négatif (solde actuel : % GNF, montant demandé : % GNF).', v_balance_excluding, new.amount;
  end if;
  return new;
end
$function$;

create or replace function public.record_cash_transaction(p_store_id uuid, p_transaction_type cash_transaction_type, p_designation text, p_amount numeric, p_operation_id uuid, p_confirm_negative boolean default false)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
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
      or (
        p_transaction_type='deposit' and public.has_permission(m.company_id,'cash_transactions.write')
      )
      or (
        p_transaction_type='withdrawal'
        and public.has_permission(m.company_id,'cash_transactions.write')
        and public.has_permission(m.company_id,'expenses.write')
      )
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

  -- Propriétaire ou "Manager" (cash_transactions.override_negative_balance)
  -- seulement, et seulement si le client a lui-même obtenu une confirmation
  -- explicite (SM-01 assoupli sur demande du 17/09 — reste bloqué sans
  -- recours pour un employé simple).
  if p_confirm_negative and (public.is_company_admin(v_company) or public.has_permission(v_company,'cash_transactions.override_negative_balance')) then
    perform set_config('app.allow_negative_cash','true',true);
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
$function$;

create or replace function public.record_expense(p_store_id uuid, p_label text, p_amount numeric, p_expense_date date, p_operation_id uuid, p_confirm_negative boolean default false)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_company uuid;v_expense uuid;v_request uuid;v_threshold numeric;v_admin boolean;
begin
  if p_operation_id is null then raise exception 'Identifiant d’opération requis';end if;
  if length(trim(p_label))<2 then raise exception 'Motif requis';end if;
  if p_amount<=0 then raise exception 'Le montant doit être positif';end if;
  select s.company_id,c.expense_approval_threshold,public.is_company_admin(s.company_id) into v_company,v_threshold,v_admin
  from public.stores s join public.companies c on c.id=s.company_id where s.id=p_store_id and s.is_active
    and public.can_access_store(s.company_id,s.id) and public.has_permission(s.company_id,'expenses.write') and public.has_active_subscription(s.company_id);
  if v_company is null then raise exception 'Boutique invalide ou non autorisée';end if;
  if p_confirm_negative and (v_admin or public.has_permission(v_company,'cash_transactions.override_negative_balance')) then
    perform set_config('app.allow_negative_cash','true',true);
  end if;
  perform public.lock_operation(p_operation_id);
  select id into v_expense from public.expenses where company_id=v_company and operation_id=p_operation_id;if v_expense is not null then return v_expense;end if;
  select id into v_request from public.expense_requests where operation_id=p_operation_id;if v_request is not null then return v_request;end if;
  if not v_admin and v_threshold is not null and p_amount>=v_threshold then
    insert into public.expense_requests(company_id,store_id,label,amount,expense_date,operation_id,requested_by)
      values(v_company,p_store_id,trim(p_label),p_amount,p_expense_date,p_operation_id,auth.uid()) returning id into v_request;
    insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by)
      values(v_company,auth.uid(),'request_expense','expense_requests',v_request,jsonb_build_object('amount',p_amount,'label',trim(p_label),'store_id',p_store_id),auth.uid());
    return v_request;
  end if;
  insert into public.expenses(company_id,store_id,label,amount,expense_date,operation_id,created_by)
    values(v_company,p_store_id,trim(p_label),p_amount,p_expense_date,p_operation_id,auth.uid()) returning id into v_expense;
  insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by)
    values(v_company,auth.uid(),'create_expense','expenses',v_expense,jsonb_build_object('amount',p_amount,'label',trim(p_label),'store_id',p_store_id),auth.uid());
  return v_expense;
end $function$;

create or replace function public.record_purchase(p_store_id uuid, p_supplier_id uuid, p_items jsonb, p_paid boolean default true, p_operation_id uuid default gen_random_uuid(), p_confirm_negative boolean default false)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_company uuid;v_purchase uuid;v_item jsonb;v_product uuid;v_quantity numeric;v_cost numeric;v_total numeric:=0;
begin
  select company_id into v_company from stores where id=p_store_id and is_active and public.can_access_store(company_id,id);
  if v_company is null or not public.has_active_subscription(v_company) or not (public.has_permission(v_company,'stock_movements.write') or public.has_permission(v_company,'suppliers.write')) then raise exception 'Accès approvisionnement refusé';end if;
  if not exists(select 1 from suppliers where id=p_supplier_id and company_id=v_company and store_id=p_store_id and is_active) then raise exception 'Fournisseur invalide';end if;
  if p_confirm_negative and (public.is_company_admin(v_company) or public.has_permission(v_company,'cash_transactions.override_negative_balance')) then
    perform set_config('app.allow_negative_cash','true',true);
  end if;
  perform public.lock_operation(p_operation_id);
  select id into v_purchase from purchases where operation_id=p_operation_id;
  if v_purchase is not null then return v_purchase;end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Ajoutez au moins un produit';end if;
  v_purchase:=gen_random_uuid();
  insert into purchases(id,company_id,supplier_id,store_id,total,amount_paid,amount_due,operation_id,payment_status,created_by) values(v_purchase,v_company,p_supplier_id,p_store_id,0,0,0,p_operation_id,case when p_paid then 'paid' else 'due' end,auth.uid());
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_product:=(v_item->>'productId')::uuid;v_quantity:=(v_item->>'quantity')::numeric;v_cost:=(v_item->>'unitCost')::numeric;
    if v_quantity<=0 or v_cost<0 or not exists(select 1 from products where id=v_product and company_id=v_company and store_id=p_store_id and is_active) then raise exception 'Ligne approvisionnement invalide';end if;
    insert into purchase_items(company_id,purchase_id,product_id,quantity,unit_cost,created_by) values(v_company,v_purchase,v_product,v_quantity,v_cost,auth.uid());
    insert into stock_levels(company_id,store_id,product_id,product_variant_id,quantity,created_by) values(v_company,p_store_id,v_product,null,v_quantity,auth.uid()) on conflict(company_id,store_id,product_id,product_variant_id) do update set quantity=stock_levels.quantity+excluded.quantity,updated_at=now();
    insert into stock_movements(company_id,store_id,product_id,quantity,movement_type,operation_id,note,created_by) values(v_company,p_store_id,v_product,v_quantity,'purchase',gen_random_uuid(),'Approvisionnement '||v_purchase,auth.uid());
    update products set purchase_price=v_cost where id=v_product;
    v_total:=v_total+v_quantity*v_cost;
  end loop;
  update purchases set total=v_total,amount_paid=case when p_paid then v_total else 0 end,amount_due=case when p_paid then 0 else v_total end where id=v_purchase;
  if p_paid and v_total>0 then insert into cash_transactions(company_id,store_id,transaction_type,designation,amount,source,operation_id,created_by) values(v_company,p_store_id,'withdrawal','Approvisionnement fournisseur',v_total,'purchase',p_operation_id,auth.uid());end if;
  return v_purchase;
end $function$;

commit;
