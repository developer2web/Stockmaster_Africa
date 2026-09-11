begin;
insert into public.permissions(code,description)
values('notifications.read','Consulter les notifications de gestion')
on conflict(code) do update set description=excluded.description;
insert into public.role_permissions(company_id,role_id,permission_id,created_by)
select r.company_id,r.id,p.id,r.created_by
from public.roles r cross join public.permissions p
where r.code='employee' and lower(trim(r.name))='manager' and p.code='notifications.read'
on conflict(role_id,permission_id) do nothing;

-- Include the permission when bootstrap creates the default Manager role.
do $$
declare original text; revised text;
begin
  original:=pg_get_functiondef('public.create_business(text,text,text)'::regprocedure);
  revised:=replace(original,
    'select v_company, v_manager, p.id, auth.uid() from permissions p where p.code in (',
    'select v_company, v_manager, p.id, auth.uid() from permissions p where p.code in (''notifications.read'',');
  if revised=original then raise exception 'Default Manager permission assignment not found';end if;
  execute revised;
end $$;

alter table public.notifications
  add column store_id uuid references public.stores(id) on delete cascade,
  add column email_enabled boolean not null default true;
create index notifications_recipient_store_idx on public.notifications(user_id,store_id,created_at desc);

-- Re-check current permissions on every read, including old targeted alerts.
create or replace function public.can_read_notification(
  p_company_id uuid,p_user_id uuid,p_type text,p_store_id uuid
) returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and (
    (p_user_id=auth.uid() and public.is_super_admin())
    or (public.is_company_admin(p_company_id) and (p_user_id is null or p_user_id=auth.uid()))
    or (p_user_id=auth.uid()
      and public.belongs_to_company(p_company_id)
      and p_type not like 'subscription_%' and p_type not like 'payment_%'
      and (
        -- Existing personal messages are not broadcast to other employees.
        (p_store_id is null and p_type not in ('low_stock','stock_out','customer_debt','supplier_debt','cash_unclosed'))
        or (public.belongs_to_company(p_company_id)
          and public.has_permission(p_company_id,'notifications.read')
          and exists(select 1 from public.stores s where s.id=p_store_id and s.company_id=p_company_id and s.is_active)
          and public.can_access_store(p_company_id,p_store_id)
          and p_type in ('low_stock','stock_out')
          and public.has_permission(p_company_id,'stock_movements.read'))
      ))
  );
$$;
revoke all on function public.can_read_notification(uuid,uuid,text,uuid) from public,anon;
grant execute on function public.can_read_notification(uuid,uuid,text,uuid) to authenticated;
drop policy if exists notifications_recipient_select on public.notifications;
create policy notifications_recipient_select on public.notifications
for select to authenticated using (
  created_at>now()-interval '48 hours'
  and public.can_read_notification(company_id,user_id,type,store_id)
);
drop policy if exists notifications_recipient_update on public.notifications;
create policy notifications_recipient_update on public.notifications
for update to authenticated using (
  created_at>now()-interval '48 hours'
  and public.can_read_notification(company_id,user_id,type,store_id)
) with check (
  created_at>now()-interval '48 hours'
  and public.can_read_notification(company_id,user_id,type,store_id)
);
revoke update on public.notifications from public,anon,authenticated;
grant update(read_at) on public.notifications to authenticated;

-- New Manager alerts are in-app only. Preserve existing owner email behavior.
create or replace function public.enqueue_notification_email()
returns trigger language plpgsql security definer set search_path='' as $$
declare recipient record;
begin
  if not new.email_enabled then return new;end if;
  for recipient in
    select distinct r.id,r.email from (
      select p.id,u.email::text from public.profiles p join auth.users u on u.id=p.id
      where new.user_id is not null and p.id=new.user_id
      union all
      select p.id,u.email::text from public.memberships m
      join public.roles r on r.id=m.role_id and r.code='company_admin'
      join public.profiles p on p.id=m.user_id join auth.users u on u.id=p.id
      where m.company_id=new.company_id and m.is_active
    ) r where r.email is not null and trim(r.email)<>''
  loop
    insert into public.notification_email_outbox(notification_id,recipient_user_id,recipient_email,subject,text_body)
    values(new.id,recipient.id,lower(trim(recipient.email)),new.title,new.body)
    on conflict(notification_id,recipient_user_id) do nothing;
  end loop;
  return new;
end $$;

create or replace function public.notify_low_stock_crossing()
returns trigger language plpgsql security definer set search_path='' as $$
declare threshold numeric; product_name text; store_name text; notification_title text; notification_body text;
begin
  select p.low_stock_threshold,p.name,s.name into threshold,product_name,store_name
  from public.products p join public.stores s on s.id=new.store_id and s.company_id=new.company_id
  join public.companies c on c.id=s.company_id and c.is_active and c.plan_archived_at is null
  where p.id=new.product_id and p.company_id=new.company_id and p.store_id=new.store_id and s.is_active;
  if threshold is null or new.quantity>threshold then return new;end if;
  if tg_op='UPDATE' and old.quantity<=threshold then return new;end if;
  notification_title:='Stock faible : '||coalesce(product_name,'Produit');
  notification_body:=coalesce(store_name,'Boutique')||' · stock actuel : '||new.quantity||' · seuil : '||threshold;
  insert into public.notifications(company_id,store_id,user_id,title,body,type,created_by)
  values(new.company_id,new.store_id,null,notification_title,notification_body,'low_stock',new.created_by);

  insert into public.notifications(company_id,store_id,user_id,title,body,type,created_by,email_enabled)
  select distinct new.company_id,new.store_id,m.user_id,notification_title,notification_body,'low_stock',new.created_by,false
  from public.memberships m join public.roles r on r.id=m.role_id and r.company_id=m.company_id
  where m.company_id=new.company_id and m.is_active and r.code='employee'
    and (m.all_stores or m.store_id=new.store_id or exists(
      select 1 from public.membership_stores ms where ms.membership_id=m.id and ms.company_id=new.company_id and ms.store_id=new.store_id))
    and exists(select 1 from public.role_permissions rp join public.permissions p on p.id=rp.permission_id
      where rp.role_id=r.id and p.code='notifications.read')
    and exists(select 1 from public.role_permissions rp join public.permissions p on p.id=rp.permission_id
      where rp.role_id=r.id and p.code in ('stock_movements.read','stock_movements.write'));
  return new;
end $$;
-- The replaced legacy endpoint exposed cross-store financial alerts without
-- per-module permission checks. All current clients use the recipient inbox.
revoke all on function public.get_internal_notifications(uuid) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
