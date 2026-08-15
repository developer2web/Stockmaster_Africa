create table public.user_security_events(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id) on delete cascade,event_type text not null,device_label text,created_at timestamptz not null default now());
create index user_security_events_user_created_idx on public.user_security_events(user_id,created_at desc);
alter table public.user_security_events enable row level security;
create policy user_security_events_self on public.user_security_events for select to authenticated using(user_id=auth.uid() or public.is_super_admin());
grant select on public.user_security_events to authenticated;revoke insert,update,delete on public.user_security_events from anon,authenticated;
create or replace function public.record_security_event(p_event_type text,p_device_label text default null) returns void language plpgsql security definer set search_path=public as $$ begin if auth.uid() is null then raise exception 'Authentification requise';end if;if p_event_type not in ('login','mfa_enabled','mfa_disabled','global_logout') then raise exception 'Événement invalide';end if;insert into user_security_events(user_id,event_type,device_label) values(auth.uid(),p_event_type,left(p_device_label,120));end $$;
grant execute on function public.record_security_event(text,text) to authenticated;
