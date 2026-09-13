-- notify_super_admins_new_support_ticket (202609120009) inserted the fixed
-- stockmaster.africa@gmail.com row keyed on (v_first_notification_id, new.
-- created_by), reasoning that new.created_by could only collide with the
-- per-super-admin outbox row (a different recipient_user_id). That reasoning
-- predates 202609100005, which dropped the "new.user_id is null" condition
-- from enqueue_notification_email's company-admin branch: every notification
-- now also auto-cc's every active company_admin of new.company_id by email,
-- keyed on (notification_id, recipient_user_id=<that admin's id>). Whenever
-- the ticket creator IS the company_admin (the normal case: owners are the
-- ones filing tickets from the in-app support screen), new.created_by is
-- exactly that admin's id, so the fixed-inbox insert's ON CONFLICT DO NOTHING
-- silently drops it: this address is never actually enqueued when an owner
-- opens a ticket, which is verified in production to be the case.
--
-- Fix: give the fixed-inbox row its own dedicated notification (email_enabled
-- = false, so it does not itself cascade into enqueue_notification_email),
-- so its (notification_id, recipient_user_id) can never collide with either
-- of the other two delivery paths.
create or replace function public.notify_super_admins_new_support_ticket()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_company_name text;
  v_body text;
  v_first_admin_id uuid;
  v_ops_notification_id uuid;
begin
  select name into v_company_name from public.companies where id=new.company_id;
  v_body := coalesce(v_company_name,'Entreprise')||' · Priorité : '||new.priority||E'\nSujet : '||new.subject||E'\n\n'||left(new.description,1200);

  insert into public.notifications(company_id,user_id,title,body,type,created_by)
  select new.company_id,p.id,'Nouveau ticket d''assistance',v_body,'support_ticket_new',new.created_by
  from public.profiles p where p.is_super_admin;

  select p.id into v_first_admin_id from public.profiles p where p.is_super_admin limit 1;

  if v_first_admin_id is not null then
    insert into public.notifications(company_id,user_id,title,body,type,created_by,email_enabled)
    values(new.company_id,v_first_admin_id,'Nouveau ticket d''assistance (copie opérations)',v_body,'support_ticket_new',new.created_by,false)
    returning id into v_ops_notification_id;

    insert into public.notification_email_outbox(notification_id,recipient_user_id,recipient_email,subject,text_body)
    values(v_ops_notification_id,v_first_admin_id,'stockmaster.africa@gmail.com',
      'Nouveau ticket · Priorité '||upper(new.priority)||' · '||new.subject,v_body);
  end if;
  return new;
end $$;
notify pgrst,'reload schema';
