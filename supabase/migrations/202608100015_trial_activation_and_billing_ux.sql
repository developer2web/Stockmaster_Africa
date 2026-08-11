-- Explicit trial controls for the redesigned Super Admin billing workspace.

alter table public.billing_settings
  add column if not exists trial_enabled boolean not null default true;

create or replace function public.fill_subscription_client()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_trial integer;v_grace integer;v_trial_enabled boolean;
begin
  if new.client_id is null then select coalesce((select cb.client_id from client_businesses cb where cb.company_id=new.company_id order by cb.is_primary desc limit 1),(select c.created_by from companies c where c.id=new.company_id)) into new.client_id;end if;
  new.starts_at:=coalesce(new.starts_at,new.created_at,now());
  select trial_days,grace_period_days,trial_enabled into v_trial,v_grace,v_trial_enabled from billing_settings where id;
  if tg_op='INSERT' and new.status='trialing' and coalesce(new.payment_provider,'')='' then
    new.trial_ends_at:=new.starts_at+make_interval(days=>v_trial);
    new.current_period_ends_at:=new.trial_ends_at;
    new.expires_at:=new.trial_ends_at;
    if not v_trial_enabled then new.status:='expired';end if;
  else new.expires_at:=coalesce(new.expires_at,new.current_period_ends_at,new.trial_ends_at);end if;
  new.grace_period_ends_at:=coalesce(new.grace_period_ends_at,new.expires_at+make_interval(days=>v_grace));
  new.billing_cycle:=coalesce(new.billing_cycle,'monthly');return new;
end $$;

create or replace function public.super_admin_grant_trial(p_company_id uuid,p_days integer default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_client uuid;v_plan uuid;v_subscription uuid;v_days integer;v_expires timestamptz;
begin
  if not public.is_super_admin() then raise exception 'Accès Super Admin requis';end if;
  select coalesce(p_days,trial_days) into v_days from billing_settings where id;
  if v_days<1 or v_days>90 then raise exception 'Durée d''essai invalide';end if;
  if exists(select 1 from subscriptions where company_id=p_company_id and status='active' and coalesce(expires_at,current_period_ends_at)>now()) then raise exception 'Cette entreprise possède déjà un abonnement actif';end if;
  select cb.client_id into v_client from client_businesses cb where cb.company_id=p_company_id order by cb.is_primary desc,cb.created_at limit 1;
  if v_client is null then raise exception 'Propriétaire de l''entreprise introuvable';end if;
  select id into v_plan from plans where code='basic' and is_active;
  if v_plan is null then raise exception 'Forfait Basic indisponible';end if;
  v_expires:=now()+make_interval(days=>v_days);
  update subscriptions set status='expired' where company_id=p_company_id and status in ('pending','trialing','past_due');
  insert into subscriptions(company_id,client_id,plan_id,status,payment_provider,payment_reference,billing_cycle,starts_at,trial_ends_at,expires_at,current_period_ends_at,grace_period_ends_at,auto_renew,created_by)
  select p_company_id,v_client,v_plan,'trialing','free_trial','trial-'||gen_random_uuid()::text,'monthly',now(),v_expires,v_expires,v_expires,v_expires+make_interval(days=>grace_period_days),false,auth.uid() from billing_settings where id
  returning id into v_subscription;
  insert into audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by) values(p_company_id,auth.uid(),'grant_free_trial','subscriptions',v_subscription,jsonb_build_object('days',v_days),auth.uid());
  return v_subscription;
end $$;

grant execute on function public.super_admin_grant_trial(uuid,integer) to authenticated;
revoke all on function public.super_admin_grant_trial(uuid,integer) from anon;
