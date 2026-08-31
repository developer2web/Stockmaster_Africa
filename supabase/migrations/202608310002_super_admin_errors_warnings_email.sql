-- Super Admin incident centre, duplicate warnings and owner email delivery.

alter table public.app_error_events
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references public.profiles(id),
  add column if not exists resolution_note text;

create or replace function public.super_admin_resolve_error(
  p_error_id uuid,
  p_resolved boolean,
  p_note text default null
) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not public.is_super_admin() then raise exception 'Accès Super Admin requis';end if;
  update public.app_error_events set
    resolved_at=case when p_resolved then now() else null end,
    resolved_by=case when p_resolved then auth.uid() else null end,
    resolution_note=case when p_resolved then nullif(left(trim(coalesce(p_note,'')),500),'') else null end
  where id=p_error_id;
  if not found then raise exception 'Erreur introuvable';end if;
end $$;
grant execute on function public.super_admin_resolve_error(uuid,boolean,text) to authenticated;
revoke all on function public.super_admin_resolve_error(uuid,boolean,text) from anon;

create table public.platform_warning_reviews(
  warning_key text primary key,
  status text not null default 'open' check(status in ('open','ignored','resolved')),
  note text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists touch_updated_at on public.platform_warning_reviews;
create trigger touch_updated_at before update on public.platform_warning_reviews
for each row execute function public.touch_updated_at();
alter table public.platform_warning_reviews enable row level security;
create policy platform_warning_reviews_super_select on public.platform_warning_reviews
for select to authenticated using(public.is_super_admin());
revoke insert,update,delete on public.platform_warning_reviews from anon,authenticated;
grant select on public.platform_warning_reviews to authenticated;

create or replace function public.review_platform_warning(
  p_warning_key text,
  p_status text,
  p_note text default null
) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not public.is_super_admin() then raise exception 'Accès Super Admin requis';end if;
  if p_status not in ('open','ignored','resolved') then raise exception 'Statut invalide';end if;
  insert into public.platform_warning_reviews(warning_key,status,note,reviewed_by,reviewed_at)
  values(left(p_warning_key,180),p_status,nullif(left(trim(coalesce(p_note,'')),500),''),auth.uid(),now())
  on conflict(warning_key) do update set
    status=excluded.status,note=excluded.note,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at;
end $$;
grant execute on function public.review_platform_warning(text,text,text) to authenticated;
revoke all on function public.review_platform_warning(text,text,text) from anon;

create or replace function public.super_admin_platform_warnings()
returns table(
  warning_key text,warning_type text,severity text,title text,detail text,
  company_ids uuid[],company_names text[],occurrence_count bigint,
  detected_at timestamptz,status text,note text
)
language sql stable security definer set search_path=public as $$
with latest_subscriptions as (
  select distinct on(company_id) company_id,status,trial_ends_at,expires_at,current_period_ends_at
  from public.subscriptions order by company_id,created_at desc
), candidates as (
  select 'company_name:'||md5(lower(trim(c.name))) warning_key,'duplicate_company_name' warning_type,
    'warning' severity,'Entreprises au nom identique' title,
    count(*)||' entreprises utilisent le nom « '||min(c.name)||' ». Vérifiez leurs coordonnées avant toute action.' detail,
    array_agg(c.id order by c.created_at) company_ids,array_agg(c.name order by c.created_at) company_names,
    count(*)::bigint occurrence_count,max(c.created_at) detected_at
  from public.companies c where c.is_active group by lower(trim(c.name)) having count(*)>1
  union all
  select 'company_phone:'||md5(regexp_replace(c.phone,'\D','','g')),'duplicate_company_phone','warning',
    'Téléphone partagé par plusieurs entreprises',count(*)||' entreprises utilisent le même numéro de téléphone.',
    array_agg(c.id order by c.created_at),array_agg(c.name order by c.created_at),count(*)::bigint,max(c.created_at)
  from public.companies c where c.is_active and length(regexp_replace(coalesce(c.phone,''),'\D','','g'))>=7
  group by regexp_replace(c.phone,'\D','','g') having count(*)>1
  union all
  select 'company_address:'||md5(lower(trim(c.address))),'duplicate_company_address','info',
    'Adresse partagée par plusieurs entreprises',count(*)||' entreprises utilisent la même adresse. Cette similarité peut être normale.',
    array_agg(c.id order by c.created_at),array_agg(c.name order by c.created_at),count(*)::bigint,max(c.created_at)
  from public.companies c where c.is_active and length(trim(coalesce(c.address,'')))>=8
  group by lower(trim(c.address)) having count(*)>1
  union all
  select 'multiple_trials:'||m.user_id::text,'multiple_trials_owner','critical',
    'Plusieurs essais pour un même propriétaire',count(*)||' entreprises en essai actif appartiennent au même propriétaire.',
    array_agg(m.company_id order by c.created_at),array_agg(c.name order by c.created_at),count(*)::bigint,max(c.created_at)
  from public.memberships m join public.roles r on r.id=m.role_id and r.code='company_admin'
  join public.companies c on c.id=m.company_id and c.is_active
  join latest_subscriptions s on s.company_id=m.company_id and s.status='trialing'
    and coalesce(s.trial_ends_at,s.expires_at,s.current_period_ends_at)>now()
  where m.is_active group by m.user_id having count(*)>1
  union all
  select 'error_spike:'||e.company_id::text||':'||current_date::text,'error_spike','critical',
    'Pic d’erreurs applicatives',count(*)||' erreurs ont été enregistrées en 24 heures pour '||coalesce(max(c.name),'une entreprise')||'.',
    array[e.company_id],array[coalesce(max(c.name),'Entreprise')],count(*)::bigint,max(e.created_at)
  from public.app_error_events e left join public.companies c on c.id=e.company_id
  where e.created_at>=now()-interval '24 hours' and e.severity in ('error','fatal') and e.resolved_at is null and e.company_id is not null
  group by e.company_id having count(*)>=5
  union all
  select 'email_delivery','email_delivery','critical','Emails transactionnels en attente',
    count(*)||' email(s) n’ont pas encore été envoyés. Vérifiez Resend et l’adresse d’expédition.',
    array[]::uuid[],array[]::text[],count(*)::bigint,max(o.created_at)
  from public.notification_email_outbox o where o.status in ('pending','failed')
  having count(*)>0
)
select c.warning_key,c.warning_type,c.severity,c.title,c.detail,c.company_ids,c.company_names,
  c.occurrence_count,c.detected_at,coalesce(r.status,'open'),r.note
from candidates c left join public.platform_warning_reviews r using(warning_key)
where public.is_super_admin()
order by case coalesce(r.status,'open') when 'open' then 0 when 'ignored' then 1 else 2 end,
  case c.severity when 'critical' then 0 when 'warning' then 1 else 2 end,c.detected_at desc
$$;
grant execute on function public.super_admin_platform_warnings() to authenticated;
revoke all on function public.super_admin_platform_warnings() from anon;

create or replace function public.super_admin_email_delivery_summary()
returns table(status text,total bigint,last_event_at timestamptz,last_error text)
language sql stable security definer set search_path=public as $$
  select o.status,count(*)::bigint,max(o.created_at),
    (array_agg(o.last_error order by o.updated_at desc) filter(where o.last_error is not null))[1]
  from public.notification_email_outbox o where public.is_super_admin()
  group by o.status order by o.status
$$;
grant execute on function public.super_admin_email_delivery_summary() to authenticated;
revoke all on function public.super_admin_email_delivery_summary() from anon;

-- A notification addressed to an employee is also emailed to every active
-- owner/admin of that company. In-app visibility remains recipient-scoped.
create or replace function public.enqueue_notification_email()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_recipient record;
begin
  for v_recipient in
    select distinct recipient.id,recipient.email
    from (
      select p.id,u.email::text from public.profiles p join auth.users u on u.id=p.id
      where new.user_id is not null and p.id=new.user_id
      union all
      select p.id,u.email::text
      from public.memberships m join public.roles r on r.id=m.role_id and r.code='company_admin'
      join public.profiles p on p.id=m.user_id join auth.users u on u.id=p.id
      where m.company_id=new.company_id and m.is_active
    ) recipient where recipient.email is not null and trim(recipient.email)<>''
  loop
    insert into public.notification_email_outbox(notification_id,recipient_user_id,recipient_email,subject,text_body)
    values(new.id,v_recipient.id,lower(trim(v_recipient.email)),new.title,new.body)
    on conflict(notification_id,recipient_user_id) do nothing;
  end loop;
  return new;
end $$;

create or replace function public.notify_super_admins_new_support_ticket()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_company_name text;
begin
  select name into v_company_name from public.companies where id=new.company_id;
  insert into public.notifications(company_id,user_id,title,body,type,created_by)
  select new.company_id,p.id,'Nouveau ticket d''assistance',
    coalesce(v_company_name,'Entreprise')||' · Priorité : '||new.priority||E'\nSujet : '||new.subject||E'\n\n'||left(new.description,1200),
    'support_ticket_new',new.created_by
  from public.profiles p where p.is_super_admin;
  return new;
end $$;
