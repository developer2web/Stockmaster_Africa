-- Optional approval workflow for high employee expenses.

alter table public.companies add column if not exists expense_approval_threshold numeric(14,2)
  check(expense_approval_threshold is null or expense_approval_threshold>=0);

create table if not exists public.expense_requests(
  id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,label text not null,amount numeric(12,2) not null check(amount>0),
  expense_date date not null,status text not null default 'pending' check(status in ('pending','approved','rejected')),
  operation_id uuid not null unique,requested_by uuid not null references public.profiles(id),reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,review_note text,expense_id uuid references public.expenses(id) on delete restrict,created_at timestamptz not null default now()
);
alter table public.expense_requests enable row level security;
create policy expense_requests_read on public.expense_requests for select to authenticated using(
  public.belongs_to_company(company_id) and public.can_access_store(company_id,store_id) and public.has_permission(company_id,'expenses.read')
  and (requested_by=auth.uid() or public.is_company_admin(company_id)));
grant select on public.expense_requests to authenticated;
revoke insert,update,delete on public.expense_requests from anon,authenticated;

create or replace function public.record_expense(p_store_id uuid,p_label text,p_amount numeric,p_expense_date date,p_operation_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_company uuid;v_expense uuid;v_request uuid;v_threshold numeric;v_admin boolean;
begin
  if p_operation_id is null then raise exception 'Identifiant d’opération requis';end if;
  if length(trim(p_label))<2 then raise exception 'Motif requis';end if;
  if p_amount<=0 then raise exception 'Le montant doit être positif';end if;
  select s.company_id,c.expense_approval_threshold,public.is_company_admin(s.company_id) into v_company,v_threshold,v_admin
  from public.stores s join public.companies c on c.id=s.company_id where s.id=p_store_id and s.is_active
    and public.can_access_store(s.company_id,s.id) and public.has_permission(s.company_id,'expenses.write') and public.has_active_subscription(s.company_id);
  if v_company is null then raise exception 'Boutique invalide ou non autorisée';end if;
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
end $$;

create or replace function public.review_expense_request(p_request_id uuid,p_approve boolean,p_note text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_request public.expense_requests%rowtype;v_expense uuid;
begin
  select * into v_request from public.expense_requests where id=p_request_id for update;
  if v_request.id is null or not public.is_company_admin(v_request.company_id) then raise exception 'Validation réservée à l’administrateur';end if;
  if v_request.status<>'pending' then raise exception 'Cette demande a déjà été traitée';end if;
  if not p_approve and length(trim(coalesce(p_note,'')))<3 then raise exception 'Le motif du refus est obligatoire';end if;
  if p_approve then
    insert into public.expenses(company_id,store_id,label,amount,expense_date,operation_id,created_by)
      values(v_request.company_id,v_request.store_id,v_request.label,v_request.amount,v_request.expense_date,v_request.operation_id,v_request.requested_by)
      returning id into v_expense;
  end if;
  update public.expense_requests set status=case when p_approve then 'approved' else 'rejected' end,reviewed_by=auth.uid(),
    reviewed_at=now(),review_note=nullif(trim(p_note),''),expense_id=v_expense where id=p_request_id;
  insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by)
    values(v_request.company_id,auth.uid(),case when p_approve then 'approve_expense' else 'reject_expense' end,'expense_requests',p_request_id,
      jsonb_build_object('amount',v_request.amount,'expense_id',v_expense,'note',p_note),auth.uid());
  return coalesce(v_expense,p_request_id);
end $$;

grant execute on function public.record_expense(uuid,text,numeric,date,uuid) to authenticated;
grant execute on function public.review_expense_request(uuid,boolean,text) to authenticated;
revoke all on function public.record_expense(uuid,text,numeric,date,uuid) from anon;
revoke all on function public.review_expense_request(uuid,boolean,text) from anon;
