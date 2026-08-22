create or replace function public.process_payment_webhook(
  p_provider text,
  p_provider_reference text,
  p_provider_event_id text,
  p_status text,
  p_amount numeric,
  p_currency text,
  p_payload jsonb default '{}'::jsonb
) returns table(transaction_id uuid,subscription_id uuid,result_status text)
language plpgsql security definer set search_path=public
as $$
declare
  v_payment payment_transactions%rowtype;
  v_subscription uuid;
  v_starts timestamptz:=now();
  v_expires timestamptz;
  v_grace_days integer:=5;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required'; end if;

  select * into v_payment from payment_transactions
  where provider=p_provider and provider_reference=p_provider_reference
  for update;
  if not found then raise exception 'Transaction de paiement inconnue'; end if;

  if p_provider_event_id is not null and exists(
    select 1 from payment_status_log where provider_event_id=p_provider_event_id
  ) then
    return query select v_payment.id,v_payment.subscription_id,v_payment.status;
    return;
  end if;

  if v_payment.status='succeeded' then
    return query select v_payment.id,v_payment.subscription_id,v_payment.status;
    return;
  end if;

  if p_status='succeeded' then
    if p_amount<>v_payment.amount then raise exception 'Montant de paiement incorrect'; end if;
    if upper(p_currency)<>v_payment.currency then raise exception 'Devise de paiement incorrecte'; end if;

    select coalesce(grace_period_days,5) into v_grace_days from billing_settings where id limit 1;
    v_expires:=case when v_payment.billing_cycle='annual'
      then v_starts+interval '1 year' else v_starts+interval '1 month' end
      + make_interval(days=>coalesce(v_payment.bonus_days,0));

    update subscriptions set status='expired'
    where client_id=v_payment.client_id
      and company_id=v_payment.company_id
      and status in ('trialing','active','past_due');

    insert into subscriptions(
      company_id,client_id,plan_id,status,payment_provider,payment_reference,
      billing_cycle,starts_at,expires_at,grace_period_ends_at,
      current_period_ends_at,auto_renew,created_by
    ) values(
      v_payment.company_id,v_payment.client_id,v_payment.plan_id,'active',
      v_payment.provider,v_payment.provider_reference,v_payment.billing_cycle,
      v_starts,v_expires,v_expires+make_interval(days=>v_grace_days),v_expires,false,v_payment.client_id
    ) returning id into v_subscription;

    update payment_transactions set
      status='succeeded',subscription_id=v_subscription,confirmed_at=now(),
      provider_payload=coalesce(p_payload,'{}'::jsonb),failure_reason=null
    where id=v_payment.id;

    if v_payment.promotion_id is not null then
      insert into promotion_redemptions(
        promotion_id,client_id,company_id,payment_transaction_id,discount_amount,bonus_days
      ) values(
        v_payment.promotion_id,v_payment.client_id,v_payment.company_id,v_payment.id,
        v_payment.discount_amount,v_payment.bonus_days
      ) on conflict(promotion_id,company_id) do nothing;
    end if;
  else
    update payment_transactions set
      status=case when p_status in ('failed','cancelled','expired') then p_status else 'processing' end,
      provider_payload=coalesce(p_payload,'{}'::jsonb),
      failure_reason=p_payload->>'message'
    where id=v_payment.id;
  end if;

  insert into payment_status_log(
    payment_transaction_id,old_status,new_status,source,provider_event_id,payload
  ) values(
    v_payment.id,v_payment.status,
    case when p_status in ('succeeded','failed','cancelled','expired') then p_status else 'processing' end,
    'webhook',p_provider_event_id,coalesce(p_payload,'{}'::jsonb)
  ) on conflict(provider_event_id) do nothing;

  return query select v_payment.id,v_subscription,
    case when p_status in ('succeeded','failed','cancelled','expired') then p_status else 'processing' end;
end
$$;

revoke all on function public.process_payment_webhook(text,text,text,text,numeric,text,jsonb)
from public,anon,authenticated;
grant execute on function public.process_payment_webhook(text,text,text,text,numeric,text,jsonb)
to service_role;
