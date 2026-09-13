begin;
-- Every new support ticket already notifies each Super Admin in-app and at
-- their own registered email (notify_super_admins_new_support_ticket +
-- enqueue_notification_email, both from 202608250004/202608310002). This adds
-- a fixed operations inbox as an always-included recipient, independent of
-- how many Super Admin accounts exist or which email each one registered
-- with. recipient_user_id only needs to satisfy the table's foreign key; the
-- ticket's own creator already exists and is guaranteed distinct from the
-- Super Admin whose notification we attach to, so it cannot collide with the
-- per-admin row enqueue_notification_email inserts for that same
-- (notification_id, recipient_user_id) pair.
create or replace function public.notify_super_admins_new_support_ticket()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_company_name text;
  v_body text;
  v_first_notification_id uuid;
begin
  select name into v_company_name from public.companies where id=new.company_id;
  v_body := coalesce(v_company_name,'Entreprise')||' · Priorité : '||new.priority||E'\nSujet : '||new.subject||E'\n\n'||left(new.description,1200);

  with inserted as (
    insert into public.notifications(company_id,user_id,title,body,type,created_by)
    select new.company_id,p.id,'Nouveau ticket d''assistance',v_body,'support_ticket_new',new.created_by
    from public.profiles p where p.is_super_admin
    returning id
  )
  select id into v_first_notification_id from inserted limit 1;

  if v_first_notification_id is not null then
    insert into public.notification_email_outbox(notification_id,recipient_user_id,recipient_email,subject,text_body)
    values(v_first_notification_id,new.created_by,'stockmaster.africa@gmail.com',
      'Nouveau ticket · Priorité '||upper(new.priority)||' · '||new.subject,v_body)
    on conflict(notification_id,recipient_user_id) do nothing;
  end if;
  return new;
end $$;
notify pgrst,'reload schema';
commit;
