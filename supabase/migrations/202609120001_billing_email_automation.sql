begin;

-- Disabled on installation: activation never backfills historical payments.
create table private.billing_email_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  enabled_at timestamptz
);
insert into private.billing_email_settings(singleton) values(true);
create table private.billing_email_events (
  event_key text primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete cascade,
  notification_id uuid unique references public.notifications(id) on delete set null,
  kind text not null,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
revoke all on private.billing_email_settings, private.billing_email_events from public, anon, authenticated;

create function public.super_admin_billing_email_settings(p_enabled boolean default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not public.is_super_admin() then raise exception 'Accès Super Admin requis' using errcode='42501'; end if;
  if not exists(select 1 from auth.users u where u.id=auth.uid()
    and coalesce(u.raw_app_meta_data->>'must_change_password','false')<>'true'
    and (u.banned_until is null or u.banned_until<=now())
    and ((auth.jwt()->>'aal')='aal2' or not exists(select 1 from auth.mfa_factors f where f.user_id=u.id and f.status='verified')))
    then raise exception 'Vérifiez votre session et la double authentification.' using errcode='42501'; end if;
  if p_enabled is not null then
    update private.billing_email_settings set
      enabled_at=case when p_enabled and not enabled then now() else enabled_at end,
      enabled=p_enabled where singleton;
  end if;
  return (select jsonb_build_object('enabled',enabled,'enabled_at',enabled_at)
    from private.billing_email_settings where singleton);
end $$;
revoke all on function public.super_admin_billing_email_settings(boolean) from public,anon;
grant execute on function public.super_admin_billing_email_settings(boolean) to authenticated;

-- The ledger survives the 48-hour notification purge.
create function private.emit_billing_email(p_key text,p_company uuid,p_user uuid,p_subscription uuid,
  p_kind text,p_expiry timestamptz,p_title text,p_body text)
returns void language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  insert into private.billing_email_events(event_key,company_id,subscription_id,kind,expires_at)
    values(p_key,p_company,p_subscription,p_kind,p_expiry) on conflict do nothing;
  if not found then return; end if;
  insert into public.notifications(company_id,user_id,title,body,type)
    values(p_company,p_user,p_title,p_body,'subscription_payment_'||p_kind) returning id into v_id;
  update private.billing_email_events set notification_id=v_id where event_key=p_key;
end $$;
revoke all on function private.emit_billing_email(text,uuid,uuid,uuid,text,timestamptz,text,text) from public,anon,authenticated;

-- Pure function shared by scheduling and final send validation. No catch-up spam.
create function private.billing_reminder_kind(p_status text,p_expiry timestamptz,p_now timestamptz)
returns text language sql immutable set search_path='' as $$
  select case
    when p_status not in ('trialing','active','past_due','expired') then null
    when p_expiry <= p_now and p_expiry > p_now-interval '1 day' then 'expired'
    when p_status='trialing' and p_expiry > p_now and p_expiry <= p_now+interval '3 days' then 'trial_ending'
    when p_status in ('active','past_due') and p_expiry > p_now and p_expiry <= p_now+interval '1 day' then 'ending_1d'
    when p_status in ('active','past_due') and p_expiry > p_now+interval '1 day' and p_expiry <= p_now+interval '7 days' then 'ending_7d'
    else null end
$$;
revoke all on function private.billing_reminder_kind(text,timestamptz,timestamptz) from public,anon,authenticated;

create function private.enqueue_billing_emails()
returns void language plpgsql security definer set search_path='' as $$
declare v_since timestamptz; r record; v_kind text; v_title text; v_body text; v_renewal boolean; v_owner uuid;
begin
  -- Serialize overlapping cron/manual runs; the unique ledger also protects retries.
  if not pg_try_advisory_xact_lock(609120001) then return; end if;
  select enabled_at into v_since from private.billing_email_settings where singleton and enabled;
  if v_since is null then return; end if;
  for r in
    select p.*,pl.name plan_name,s.starts_at,
      coalesce(s.expires_at,s.current_period_ends_at,s.trial_ends_at) period_end
    from public.payment_transactions p
    join public.subscriptions s on s.id=p.subscription_id and s.company_id=p.company_id
    join public.plans pl on pl.id=p.plan_id
    join public.companies c on c.id=p.company_id and c.is_active and c.plan_archived_at is null
    join auth.users u on u.id=p.client_id and (u.banned_until is null or u.banned_until<=now())
    where p.status='succeeded' and p.confirmed_at>=v_since
      and not exists(select 1 from private.billing_email_events e where e.event_key='receipt:'||p.id::text)
    order by p.confirmed_at limit 100
  loop
    select exists(select 1 from public.payment_transactions old
      where old.company_id=r.company_id and old.status='succeeded' and old.id<>r.id
        and (old.confirmed_at,old.id)<(r.confirmed_at,r.id)) into v_renewal;
    v_title := case when v_renewal then 'Renouvellement confirmé' else 'Reçu de paiement' end;
    v_body := format(E'Paiement confirmé : %s %s\nReçu : %s\nForfait : %s\nPériodicité : %s\nMoyen de paiement : %s\nRéférence : %s\nDate du paiement (UTC) : %s\nDébut de période (UTC) : %s\nFin de période (UTC) : %s\n\nConservez cet email comme reçu. Retrouvez votre abonnement dans votre espace propriétaire.',
      r.amount,r.currency,r.id,r.plan_name,
      case when r.billing_cycle='annual' then 'Annuelle' else 'Mensuelle' end,
      r.provider,coalesce(r.provider_reference,r.id::text),
      to_char(r.confirmed_at at time zone 'UTC','DD/MM/YYYY HH24:MI'),
      coalesce(to_char(r.starts_at at time zone 'UTC','DD/MM/YYYY HH24:MI'),'Non renseignée'),
      coalesce(to_char(r.period_end at time zone 'UTC','DD/MM/YYYY HH24:MI'),'Consultez votre espace propriétaire'));
    perform private.emit_billing_email('receipt:'||r.id,r.company_id,r.client_id,r.subscription_id,'receipt',null,v_title,v_body);
  end loop;
  for r in
    select s.*,coalesce(s.expires_at,s.current_period_ends_at,s.trial_ends_at) deadline
    from public.companies c
    cross join lateral (select sub.* from public.subscriptions sub where sub.company_id=c.id
      order by sub.created_at desc,sub.id desc limit 1) s
    where c.is_active and c.plan_archived_at is null
  loop
    v_kind := private.billing_reminder_kind(r.status::text,r.deadline,now());
    if v_kind is null then continue; end if;
    v_title := case v_kind when 'trial_ending' then 'Votre essai se termine bientôt'
      when 'expired' then 'Votre période d’abonnement est terminée'
      else 'Votre abonnement arrive à échéance' end;
    v_body := format(E'Échéance (UTC) : %s\n\nConsultez votre espace propriétaire, rubrique Abonnement, pour connaître vos options et renouveler si nécessaire. Ce rappel ne déclenche aucun prélèvement.',
      to_char(r.deadline at time zone 'UTC','DD/MM/YYYY HH24:MI'));
    -- Explicit owner prevents disclosure through legacy company-wide notification policies.
    select m.user_id into v_owner from public.memberships m
      join public.roles roles on roles.id=m.role_id and roles.company_id=m.company_id
      join auth.users u on u.id=m.user_id
      where m.company_id=r.company_id and m.is_active and roles.code='company_admin'
        and (u.banned_until is null or u.banned_until<=now())
      order by m.user_id limit 1;
    if v_owner is null then continue; end if;
    perform private.emit_billing_email('reminder:'||r.id||':'||extract(epoch from r.deadline)::text||':'||v_kind,
      r.company_id,v_owner,r.id,v_kind,r.deadline,v_title,v_body);
  end loop;
end $$;
revoke all on function private.enqueue_billing_emails() from public,anon,authenticated;

-- Claim atomically and cancel reminders made obsolete by a renewal or date change.
create function public.claim_notification_email_job(p_job_id uuid,p_attempts integer)
returns setof public.notification_email_outbox language plpgsql security definer set search_path='' as $$
declare j public.notification_email_outbox; e private.billing_email_events; v_valid boolean;
begin
  select * into j from public.notification_email_outbox where id=p_job_id for update skip locked;
  if not found or j.status not in ('pending','failed') or j.attempts<>p_attempts
    or j.attempts>=8 or j.next_attempt_at>now() then return; end if;
  select * into e from private.billing_email_events where notification_id=j.notification_id;
  if found then
    select enabled into v_valid from private.billing_email_settings where singleton;
    v_valid := v_valid and exists(select 1 from public.profiles p join auth.users u on u.id=p.id
      where p.id=j.recipient_user_id and (u.banned_until is null or u.banned_until<=now()) and lower(trim(u.email))=j.recipient_email
      and (exists(select 1 from public.memberships m join public.roles r on r.id=m.role_id and r.company_id=m.company_id
        where m.company_id=e.company_id and m.user_id=p.id and m.is_active and r.code='company_admin')
        or (e.kind='receipt' and exists(select 1 from public.payment_transactions pay
          where 'receipt:'||pay.id::text=e.event_key and pay.client_id=p.id and pay.company_id=e.company_id))));
    if e.kind<>'receipt' then
      v_valid := v_valid and exists(select 1 from public.subscriptions s join public.companies c on c.id=s.company_id
        where s.id=e.subscription_id and c.is_active and c.plan_archived_at is null
          and coalesce(s.expires_at,s.current_period_ends_at,s.trial_ends_at)=e.expires_at
          and private.billing_reminder_kind(s.status::text,e.expires_at,now())=e.kind
          and not exists(select 1 from public.subscriptions newer where newer.company_id=s.company_id
            and (newer.created_at,newer.id)>(s.created_at,s.id)));
    end if;
    if not coalesce(v_valid,false) then
      delete from public.notification_email_outbox where id=j.id;
      return;
    end if;
  end if;
  return query update public.notification_email_outbox set status='processing',attempts=attempts+1,last_error=null
    where id=j.id returning *;
end $$;
revoke all on function public.claim_notification_email_job(uuid,integer) from public,anon,authenticated;
grant execute on function public.claim_notification_email_job(uuid,integer) to service_role;

-- Preserve pending/refused notifications; avoid a second generic success email.
create or replace function public.notify_payment_status_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare plan_name text;
begin
  if tg_op='UPDATE' and new.status is not distinct from old.status then return new; end if;
  if new.status not in ('processing','succeeded','failed') then return new; end if;
  if new.status='succeeded' and new.subscription_id is not null and new.confirmed_at is not null
    and exists(select 1 from private.billing_email_settings where singleton and enabled and new.confirmed_at>=enabled_at)
    then return new; end if;
  select name into plan_name from public.plans where id=new.plan_id;
  insert into public.notifications(company_id,user_id,title,body,type,created_by)
  values(new.company_id,new.client_id,
    case new.status when 'succeeded' then 'Paiement confirmé' when 'failed' then 'Paiement refusé'
      else case when new.provider='orange_money_manual' then 'Déclaration de paiement reçue' else 'Paiement en cours' end end,
    case new.status when 'succeeded' then 'Votre paiement pour le forfait '||coalesce(plan_name,'StockMaster')||' a été confirmé.'
      when 'failed' then 'Votre paiement n’a pas été validé. '||coalesce(nullif(new.failure_reason,''),'Contactez le support avant un nouveau transfert.')
      else 'Votre demande a été enregistrée. L’abonnement sera activé après confirmation du paiement.' end,
    'subscription_payment_'||new.status,null);
  return new;
end $$;
select cron.schedule('stockmaster-billing-emails','*/5 * * * *','select private.enqueue_billing_emails()');
notify pgrst,'reload schema';
commit;
