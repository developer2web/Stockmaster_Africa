-- One identity per email, explicit billing onboarding and employee-to-admin approval.

alter table public.companies add column if not exists billing_onboarding_completed boolean not null default true;
update public.companies set billing_onboarding_completed=true;
alter table public.companies alter column billing_onboarding_completed set default false;

create table public.admin_access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_name text not null check(length(trim(company_name)) between 2 and 120),
  store_name text not null check(length(trim(store_name)) between 2 and 120),
  country_code char(2) not null,
  status text not null default 'pending' check(status in ('pending','approved','rejected','completed','cancelled')),
  review_reason text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_company_id uuid references public.companies(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index admin_access_requests_open_user_idx on public.admin_access_requests(user_id) where status in ('pending','approved');
create index admin_access_requests_status_created_idx on public.admin_access_requests(status,created_at desc);
create trigger touch_updated_at before update on public.admin_access_requests for each row execute function public.touch_updated_at();
alter table public.admin_access_requests enable row level security;
create policy admin_access_requests_owner_read on public.admin_access_requests for select to authenticated using(user_id=auth.uid() or public.is_super_admin());
grant select on public.admin_access_requests to authenticated;
revoke insert,update,delete on public.admin_access_requests from anon,authenticated;

create or replace function public.billing_onboarding_required(p_company_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
select coalesce((select not c.billing_onboarding_completed from companies c where c.id=p_company_id and (public.is_business_owner(c.id) or public.is_super_admin())),false) $$;

create or replace function public.confirm_billing_onboarding(p_company_id uuid,p_choice text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_business_owner(p_company_id) then raise exception 'Seul le propriétaire peut confirmer ce choix';end if;
  if p_choice not in ('trial','subscription') then raise exception 'Choix d''abonnement invalide';end if;
  if p_choice='trial' and not exists(select 1 from subscriptions where company_id=p_company_id and status='trialing' and coalesce(expires_at,trial_ends_at)>now()) then raise exception 'Aucun essai gratuit disponible';end if;
  update companies set billing_onboarding_completed=true where id=p_company_id;
  insert into audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by) values(p_company_id,auth.uid(),'confirm_billing_onboarding','companies',p_company_id,jsonb_build_object('choice',p_choice),auth.uid());
end $$;

create or replace function public.request_admin_access(p_company_name text,p_store_name text,p_country_code text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentification requise';end if;
  if not exists(select 1 from memberships m join roles r on r.id=m.role_id where m.user_id=auth.uid() and m.is_active and r.code='employee') then raise exception 'Cette demande est réservée à un employé existant';end if;
  if exists(select 1 from memberships m join roles r on r.id=m.role_id where m.user_id=auth.uid() and m.is_active and r.code='company_admin') then raise exception 'Ce compte possède déjà un accès administrateur';end if;
  if not exists(select 1 from country_currency_map where country_code=upper(trim(p_country_code)) and is_active) then raise exception 'Pays non pris en charge';end if;
  if exists(select 1 from admin_access_requests where user_id=auth.uid() and status in ('pending','approved')) then raise exception 'Une demande est déjà en cours';end if;
  insert into admin_access_requests(user_id,company_name,store_name,country_code) values(auth.uid(),trim(p_company_name),trim(p_store_name),upper(trim(p_country_code))) returning id into v_id;
  return v_id;
end $$;

create or replace function public.super_admin_admin_access_requests()
returns table(id uuid,user_id uuid,email text,full_name text,company_name text,store_name text,country_code text,status text,review_reason text,created_at timestamptz,reviewed_at timestamptz)
language sql stable security definer set search_path=public as $$
select ar.id,ar.user_id,au.email::text,p.full_name,ar.company_name,ar.store_name,ar.country_code::text,ar.status,ar.review_reason,ar.created_at,ar.reviewed_at
from admin_access_requests ar join auth.users au on au.id=ar.user_id join profiles p on p.id=ar.user_id
where public.is_super_admin() order by ar.created_at desc limit 300 $$;

create or replace function public.super_admin_review_admin_access(p_request_id uuid,p_approve boolean,p_reason text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_request admin_access_requests%rowtype;
begin
  if not public.is_super_admin() then raise exception 'Accès Super Admin requis';end if;
  select * into v_request from admin_access_requests where id=p_request_id for update;
  if not found or v_request.status<>'pending' then raise exception 'Demande indisponible';end if;
  if not p_approve and length(trim(coalesce(p_reason,'')))<3 then raise exception 'Le motif du refus est obligatoire';end if;
  update admin_access_requests set status=case when p_approve then 'approved' else 'rejected' end,review_reason=case when p_approve then null else trim(p_reason) end,reviewed_by=auth.uid(),reviewed_at=now() where id=p_request_id;
end $$;

create or replace function public.finalize_approved_admin_access(p_request_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_request admin_access_requests%rowtype;v_company uuid;
begin
  select * into v_request from admin_access_requests where id=p_request_id and user_id=auth.uid() for update;
  if not found or v_request.status<>'approved' then raise exception 'Cette demande n''est pas encore approuvée';end if;
  v_company:=public.create_business(v_request.company_name,v_request.store_name,v_request.country_code);
  update admin_access_requests set status='completed',created_company_id=v_company where id=p_request_id;
  return v_company;
end $$;

grant execute on function public.billing_onboarding_required(uuid) to authenticated;
grant execute on function public.confirm_billing_onboarding(uuid,text) to authenticated;
grant execute on function public.request_admin_access(text,text,text) to authenticated;
grant execute on function public.super_admin_admin_access_requests() to authenticated;
grant execute on function public.super_admin_review_admin_access(uuid,boolean,text) to authenticated;
grant execute on function public.finalize_approved_admin_access(uuid) to authenticated;

