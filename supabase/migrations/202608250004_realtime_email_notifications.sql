-- Persistent in-app notifications, realtime delivery and a reliable email
-- outbox. The Edge Function receives only an outbox UUID and resolves the
-- recipient/content server-side, so the public webhook cannot be used to send
-- arbitrary email.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create schema if not exists private;
revoke all on schema private from public,anon,authenticated;
create table if not exists private.notification_webhook_secrets(
  id boolean primary key default true check(id),
  secret text not null check(char_length(secret)>=48),
  created_at timestamptz not null default now()
);
insert into private.notification_webhook_secrets(id,secret)
values(true,encode(extensions.gen_random_bytes(32),'hex'))
on conflict(id) do nothing;

create or replace function public.verify_notification_webhook_secret(p_secret text)
returns boolean language sql stable security definer set search_path=private,public as $$
  select coalesce(p_secret=(select secret from private.notification_webhook_secrets where id),false)
$$;
revoke all on function public.verify_notification_webhook_secret(text) from public,anon,authenticated;
grant execute on function public.verify_notification_webhook_secret(text) to service_role;

alter table public.notifications replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.support_tickets;
exception when duplicate_object then null;
end $$;

drop policy if exists notifications_tenant_select on public.notifications;
drop policy if exists notifications_tenant_insert on public.notifications;
drop policy if exists notifications_tenant_update on public.notifications;
drop policy if exists notifications_tenant_delete on public.notifications;

create policy notifications_recipient_select on public.notifications
for select to authenticated using (
  user_id=auth.uid()
  or (user_id is null and public.belongs_to_company(company_id))
);

create policy notifications_recipient_update on public.notifications
for update to authenticated using (
  user_id=auth.uid()
  or (user_id is null and public.is_company_admin(company_id))
) with check (
  user_id=auth.uid()
  or (user_id is null and public.is_company_admin(company_id))
);

grant select on public.notifications to authenticated;
grant update(read_at) on public.notifications to authenticated;
revoke insert,delete on public.notifications from authenticated;

create table public.notification_email_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  recipient_email text not null check(position('@' in recipient_email)>1),
  subject text not null check(char_length(subject) between 1 and 180),
  text_body text not null,
  status text not null default 'pending' check(status in ('pending','processing','sent','failed')),
  attempts integer not null default 0 check(attempts>=0),
  next_attempt_at timestamptz not null default now(),
  provider_reference text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(notification_id,recipient_user_id)
);

create index notification_email_outbox_pending_idx
on public.notification_email_outbox(status,next_attempt_at,created_at)
where status in ('pending','failed');

create trigger touch_updated_at before update on public.notification_email_outbox
for each row execute function public.touch_updated_at();

alter table public.notification_email_outbox enable row level security;
revoke all on public.notification_email_outbox from anon,authenticated;

create or replace function public.enqueue_notification_email()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_recipient record;
begin
  for v_recipient in
    select distinct recipient.id,recipient.email
    from (
      select p.id,u.email::text
      from public.profiles p join auth.users u on u.id=p.id
      where new.user_id is not null and p.id=new.user_id
      union all
      select p.id,u.email::text
      from public.memberships m
      join public.roles r on r.id=m.role_id and r.code='company_admin'
      join public.profiles p on p.id=m.user_id
      join auth.users u on u.id=p.id
      where new.user_id is null and m.company_id=new.company_id and m.is_active
    ) recipient
    where recipient.email is not null and trim(recipient.email)<>''
  loop
    insert into public.notification_email_outbox(
      notification_id,recipient_user_id,recipient_email,subject,text_body
    ) values(new.id,v_recipient.id,lower(trim(v_recipient.email)),new.title,new.body)
    on conflict(notification_id,recipient_user_id) do nothing;
  end loop;
  return new;
end $$;

drop trigger if exists enqueue_notification_email on public.notifications;
create trigger enqueue_notification_email after insert on public.notifications
for each row execute function public.enqueue_notification_email();

create or replace function public.dispatch_notification_email_job()
returns trigger language plpgsql security definer set search_path=public,net as $$
declare v_secret text;
begin
  select secret into v_secret from private.notification_webhook_secrets where id;
  perform net.http_post(
    url:='https://mwpbinlxablzruvpjjjy.supabase.co/functions/v1/notification-email',
    headers:=jsonb_build_object('Content-Type','application/json','X-StockMaster-Webhook',v_secret),
    body:=jsonb_build_object('jobId',new.id),
    timeout_milliseconds:=5000
  );
  return new;
exception when others then
  update public.notification_email_outbox set last_error=left(sqlerrm,1000)
  where id=new.id;
  return new;
end $$;

drop trigger if exists dispatch_notification_email_job on public.notification_email_outbox;
create trigger dispatch_notification_email_job
after insert on public.notification_email_outbox
for each row execute function public.dispatch_notification_email_job();

create or replace function public.notify_super_admins_new_support_ticket()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_company_name text;
begin
  select name into v_company_name from public.companies where id=new.company_id;
  insert into public.notifications(company_id,user_id,title,body,type,created_by)
  select new.company_id,p.id,'Nouveau ticket d''assistance',
    coalesce(v_company_name,'Entreprise')||' · '||new.priority||' · '||new.subject,
    'support_ticket_new',new.created_by
  from public.profiles p where p.is_super_admin;
  return new;
end $$;

drop trigger if exists notify_super_admins_new_support_ticket on public.support_tickets;
create trigger notify_super_admins_new_support_ticket
after insert on public.support_tickets
for each row execute function public.notify_super_admins_new_support_ticket();

create or replace function public.notify_support_ticket_update()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_status text;
begin
  if new.status is not distinct from old.status
    and new.resolution is not distinct from old.resolution then return new;end if;
  v_status:=case new.status
    when 'in_progress' then 'pris en charge'
    when 'resolved' then 'résolu'
    when 'closed' then 'fermé'
    else 'mis à jour' end;
  insert into public.notifications(company_id,user_id,title,body,type,created_by)
  values(new.company_id,new.created_by,'Mise à jour de votre demande',
    'Le ticket « '||new.subject||' » est '||v_status||
      case when nullif(trim(coalesce(new.resolution,'')),'') is null then '.'
        else '. Réponse : '||left(trim(new.resolution),700) end,
    'support_ticket_updated',new.assigned_to);
  return new;
end $$;

drop trigger if exists notify_support_ticket_update on public.support_tickets;
create trigger notify_support_ticket_update
after update of status,resolution on public.support_tickets
for each row execute function public.notify_support_ticket_update();

create or replace function public.notify_payment_status_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_plan_name text;
begin
  if tg_op='UPDATE' and new.status is not distinct from old.status then return new;end if;
  if new.status not in ('processing','succeeded','failed') then return new;end if;
  select name into v_plan_name from public.plans where id=new.plan_id;
  insert into public.notifications(company_id,user_id,title,body,type,created_by)
  values(new.company_id,new.client_id,
    case new.status when 'succeeded' then 'Paiement confirmé' when 'failed' then 'Paiement refusé' else 'Paiement reçu' end,
    case new.status
      when 'succeeded' then 'Votre paiement pour le forfait '||coalesce(v_plan_name,'StockMaster')||' a été confirmé.'
      when 'failed' then 'Votre paiement n''a pas été validé. '||coalesce(nullif(new.failure_reason,''),'Vérifiez les informations puis réessayez.')
      else 'Votre paiement a été reçu et sera vérifié.' end,
    'subscription_payment_'||new.status,null);
  return new;
end $$;

drop trigger if exists notify_payment_status_change on public.payment_transactions;
create trigger notify_payment_status_change
after insert or update of status on public.payment_transactions
for each row execute function public.notify_payment_status_change();

create or replace function public.notify_low_stock_crossing()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_threshold numeric;v_product_name text;v_store_name text;
begin
  select p.low_stock_threshold,p.name,s.name into v_threshold,v_product_name,v_store_name
  from public.products p join public.stores s on s.id=new.store_id where p.id=new.product_id;
  if v_threshold is null or new.quantity>v_threshold then return new;end if;
  if tg_op='UPDATE' and old.quantity<=v_threshold then return new;end if;
  insert into public.notifications(company_id,user_id,title,body,type,created_by)
  values(new.company_id,null,'Stock faible : '||coalesce(v_product_name,'Produit'),
    coalesce(v_store_name,'Boutique')||' · stock actuel : '||new.quantity||' · seuil : '||v_threshold,
    'low_stock',new.created_by);
  return new;
end $$;

drop trigger if exists notify_low_stock_crossing on public.stock_levels;
create trigger notify_low_stock_crossing
after insert or update of quantity on public.stock_levels
for each row execute function public.notify_low_stock_crossing();

-- Immediate calls are made by the outbox trigger. This scheduled retry also
-- drains temporary failures without requiring a user to reopen the app.
do $$
declare v_job bigint;v_secret text;
begin
  select secret into v_secret from private.notification_webhook_secrets where id;
  select jobid into v_job from cron.job where jobname='stockmaster-notification-email-retry';
  if v_job is not null then perform cron.unschedule(v_job);end if;
  perform cron.schedule(
    'stockmaster-notification-email-retry','* * * * *',
    format($job$select net.http_post(
      url:='https://mwpbinlxablzruvpjjjy.supabase.co/functions/v1/notification-email',
      headers:=jsonb_build_object('Content-Type','application/json','X-StockMaster-Webhook',%L),
      body:='{}'::jsonb,
      timeout_milliseconds:=10000
    );$job$,v_secret)
  );
end $$;
