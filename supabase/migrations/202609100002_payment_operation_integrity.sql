alter table public.payment_transactions
  add column if not exists request_details jsonb,
  add column if not exists provider_request_started_at timestamptz;

create or replace function public.protect_payment_operation()
returns trigger language plpgsql set search_path=public as $$
begin
  if row(new.client_id,new.operation_id,new.plan_id,new.provider,new.billing_cycle,new.amount,new.currency,
      new.base_amount,new.discount_amount,new.bonus_days,new.promotion_id,new.retained_company_id,new.phone_number,new.request_details)
    is distinct from row(old.client_id,old.operation_id,old.plan_id,old.provider,old.billing_cycle,old.amount,old.currency,
      old.base_amount,old.discount_amount,old.bonus_days,old.promotion_id,old.retained_company_id,old.phone_number,old.request_details)
    or (new.company_id is not null and new.company_id is distinct from old.company_id)
    or (old.provider_reference is not null and new.provider_reference is distinct from old.provider_reference) then
    raise exception 'Les paramètres d’une opération de paiement sont immuables.' using errcode='23514';
  end if;
  if old.status in ('succeeded','failed','cancelled','expired') and
    (row(new.status,new.confirmed_at) is distinct from row(old.status,old.confirmed_at)
     or (new.subscription_id is distinct from old.subscription_id
       and not (new.subscription_id is null and pg_trigger_depth()>1))) then
    raise exception 'Un paiement terminé ne peut pas être réinitialisé.' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function public.protect_payment_operation() from public,anon,authenticated;
create trigger protect_payment_operation before update on public.payment_transactions
for each row execute function public.protect_payment_operation();

create or replace function public.claim_payment_provider_request(p_payment_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_claimed uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  update public.payment_transactions set provider_request_started_at=clock_timestamp()
  where id=p_payment_id and status='pending' and provider_reference is null
    and (provider_request_started_at is null or (provider='stripe'
      and created_at>clock_timestamp()-interval '23 hours'
      and provider_request_started_at<clock_timestamp()-interval '5 minutes'))
  returning id into v_claimed;
  return v_claimed is not null;
end $$;

create or replace function public.release_payment_provider_request(p_payment_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  update public.payment_transactions set provider_request_started_at=null
  where id=p_payment_id and status='pending' and provider_reference is null;
end $$;
revoke all on function public.claim_payment_provider_request(uuid), public.release_payment_provider_request(uuid) from public,anon,authenticated;
grant execute on function public.claim_payment_provider_request(uuid), public.release_payment_provider_request(uuid) to service_role;

-- Signed events arriving late must not reopen a transaction that has already
-- reached a final status. Keep the existing amount/currency checks and locks.
do $$
declare v_definition text;
begin
  v_definition:=pg_get_functiondef('public.process_payment_webhook(text,text,text,text,numeric,text,jsonb)'::regprocedure);
  if position('if v_payment.status=''succeeded'' then' in v_definition)=0 then
    raise exception 'Définition inattendue de process_payment_webhook : vérification manuelle requise.';
  end if;
  execute replace(v_definition,'if v_payment.status=''succeeded'' then',
    'if v_payment.status in (''succeeded'',''failed'',''cancelled'',''expired'') then');
end $$;
