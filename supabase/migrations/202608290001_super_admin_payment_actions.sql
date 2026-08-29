-- Controlled payment decisions for the Super Admin portal.
-- Financial records that were confirmed are never physically deleted.

alter table public.payment_transactions
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null,
  add column if not exists archive_reason text;

create index if not exists payment_transactions_archived_idx
  on public.payment_transactions(archived_at, created_at desc);

create or replace function public.super_admin_manage_payment(
  p_payment_id uuid,
  p_action text,
  p_reason text default null
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_payment public.payment_transactions%rowtype;
  v_subscription uuid;
  v_expires timestamptz;
  v_reason text:=trim(coalesce(p_reason,''));
  v_action text:=lower(trim(coalesce(p_action,'')));
  v_old_status text;
begin
  if not public.is_super_admin() then
    raise exception 'Accès Super Admin requis';
  end if;

  select * into v_payment
  from public.payment_transactions
  where id=p_payment_id
  for update;

  if not found then
    raise exception 'Paiement introuvable';
  end if;

  if v_action='archive' then
    if v_payment.archived_at is not null then return v_payment.id; end if;
    if length(v_reason)<3 then raise exception 'Le motif d’archivage est obligatoire'; end if;
    update public.payment_transactions
      set archived_at=now(),archived_by=auth.uid(),archive_reason=v_reason
      where id=v_payment.id;
    if v_payment.company_id is not null then
      insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by)
      values(v_payment.company_id,auth.uid(),'archive_payment','payment_transactions',v_payment.id,
        jsonb_build_object('reason',v_reason,'status',v_payment.status,'provider',v_payment.provider),auth.uid());
    end if;
    return v_payment.id;
  end if;

  if v_action='restore' then
    if v_payment.archived_at is null then return v_payment.id; end if;
    update public.payment_transactions
      set archived_at=null,archived_by=null,archive_reason=null
      where id=v_payment.id;
    if v_payment.company_id is not null then
      insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by)
      values(v_payment.company_id,auth.uid(),'restore_payment','payment_transactions',v_payment.id,'{}',auth.uid());
    end if;
    return v_payment.id;
  end if;

  if v_action='delete' then
    if v_payment.status='succeeded' or v_payment.subscription_id is not null then
      raise exception 'Un paiement confirmé ne peut pas être supprimé. Archivez-le.';
    end if;
    if nullif(trim(coalesce(v_payment.provider_reference,'')),'') is not null then
      raise exception 'Un paiement possédant une référence fournisseur ne peut pas être supprimé. Archivez-le.';
    end if;
    if length(v_reason)<3 then raise exception 'Le motif de suppression est obligatoire'; end if;
    if v_payment.company_id is not null then
      insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by)
      values(v_payment.company_id,auth.uid(),'delete_unconfirmed_payment','payment_transactions',v_payment.id,
        jsonb_build_object('reason',v_reason,'status',v_payment.status,'provider',v_payment.provider,
          'amount',v_payment.amount,'currency',v_payment.currency),auth.uid());
    end if;
    delete from public.payment_transactions where id=v_payment.id;
    return v_payment.id;
  end if;

  if v_action='reject' then
    if v_payment.status not in ('pending','processing') then
      raise exception 'Seul un paiement en attente peut être refusé';
    end if;
    if length(v_reason)<3 then raise exception 'Le motif du refus est obligatoire'; end if;
    v_old_status:=v_payment.status;
    update public.payment_transactions
      set status='failed',failure_reason=v_reason,rejection_reason=v_reason,
          reviewed_at=now(),reviewed_by=auth.uid()
      where id=v_payment.id;
    insert into public.payment_status_log(payment_transaction_id,old_status,new_status,source,payload)
      values(v_payment.id,v_old_status,'failed','super-admin',jsonb_build_object('reason',v_reason));
    if v_payment.company_id is not null then
      insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by)
      values(v_payment.company_id,auth.uid(),'reject_payment','payment_transactions',v_payment.id,
        jsonb_build_object('reason',v_reason,'provider',v_payment.provider),auth.uid());
    end if;
    return v_payment.id;
  end if;

  if v_action<>'confirm' then
    raise exception 'Action de paiement inconnue';
  end if;
  if v_payment.status='succeeded' then return coalesce(v_payment.subscription_id,v_payment.id); end if;
  if v_payment.status not in ('pending','processing') then
    raise exception 'Seul un paiement en attente peut être confirmé';
  end if;
  if length(v_reason)<3 then
    raise exception 'Le motif de confirmation manuelle est obligatoire';
  end if;
  if v_payment.company_id is null then raise exception 'Entreprise du paiement introuvable'; end if;

  v_old_status:=v_payment.status;
  v_expires:=case when v_payment.billing_cycle='annual'
    then now()+interval '1 year' else now()+interval '1 month' end
    + make_interval(days=>v_payment.bonus_days);

  update public.subscriptions
    set status='expired'
    where company_id=v_payment.company_id and status in ('pending','trialing','active','past_due');

  insert into public.subscriptions(
    company_id,client_id,plan_id,status,payment_provider,payment_reference,billing_cycle,
    starts_at,expires_at,grace_period_ends_at,current_period_ends_at,auto_renew,created_by
  )
  select v_payment.company_id,v_payment.client_id,v_payment.plan_id,'active',v_payment.provider,
    v_payment.provider_reference,v_payment.billing_cycle,now(),v_expires,
    v_expires+make_interval(days=>bs.grace_period_days),v_expires,false,v_payment.client_id
  from public.billing_settings bs where bs.id
  returning id into v_subscription;

  update public.payment_transactions
    set status='succeeded',subscription_id=v_subscription,confirmed_at=now(),reviewed_at=now(),
        reviewed_by=auth.uid(),failure_reason=null,rejection_reason=null,
        archived_at=null,archived_by=null,archive_reason=null
    where id=v_payment.id;

  if v_payment.promotion_id is not null then
    insert into public.promotion_redemptions(
      promotion_id,client_id,company_id,payment_transaction_id,discount_amount,bonus_days
    ) values(
      v_payment.promotion_id,v_payment.client_id,v_payment.company_id,v_payment.id,
      v_payment.discount_amount,v_payment.bonus_days
    ) on conflict(payment_transaction_id) do nothing;
  end if;

  insert into public.payment_status_log(payment_transaction_id,old_status,new_status,source,payload)
    values(v_payment.id,v_old_status,'succeeded','super-admin-manual',
      jsonb_build_object('reason',v_reason,'reviewed_by',auth.uid(),'provider',v_payment.provider));
  insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by)
    values(v_payment.company_id,auth.uid(),'confirm_payment_manually','payment_transactions',v_payment.id,
      jsonb_build_object('reason',v_reason,'amount',v_payment.amount,'currency',v_payment.currency,
        'provider',v_payment.provider),auth.uid());
  return v_subscription;
end $$;

create or replace function public.super_admin_billing_payments_v2()
returns table(
  id uuid,company_id uuid,company_name text,client_email text,plan_name text,
  amount numeric,base_amount numeric,discount_amount numeric,currency text,provider text,
  provider_reference text,billing_cycle text,status text,proof_path text,promotion_name text,
  submitted_at timestamptz,reviewed_at timestamptz,reviewer_name text,failure_reason text,
  created_at timestamptz,archived_at timestamptz,archive_reason text
)
language sql stable security definer set search_path=public as $$
select pt.id,pt.company_id,c.name,au.email::text,p.name,pt.amount,pt.base_amount,
  pt.discount_amount,pt.currency::text,pt.provider,pt.provider_reference,pt.billing_cycle,
  pt.status,pt.proof_path,pm.name,pt.submitted_at,pt.reviewed_at,rv.full_name,
  pt.failure_reason,pt.created_at,pt.archived_at,pt.archive_reason
from public.payment_transactions pt
join public.companies c on c.id=pt.company_id
join auth.users au on au.id=pt.client_id
join public.plans p on p.id=pt.plan_id
left join public.promotions pm on pm.id=pt.promotion_id
left join public.profiles rv on rv.id=pt.reviewed_by
where public.is_super_admin()
order by pt.created_at desc limit 500
$$;

grant execute on function public.super_admin_manage_payment(uuid,text,text) to authenticated;
grant execute on function public.super_admin_billing_payments_v2() to authenticated;
revoke all on function public.super_admin_manage_payment(uuid,text,text) from anon;
revoke all on function public.super_admin_billing_payments_v2() from anon;
