-- Retour testeur du 26/09 : l'administrateur doit voir la demande de retrait
-- directement sur la fiche de l'employé concerné (écran Employés) et pouvoir
-- l'APPROUVER ou la REFUSER. Une simple notification (202609251800) ne peut pas
-- porter un état "refusée" : on ajoute donc une vraie table de demandes, lue et
-- écrite uniquement via les RPC ci-dessous (aucun accès direct à la table).
begin;

create table if not exists public.employee_access_removal_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  review_note text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid references public.profiles(id)
);
-- Une seule demande en attente par employé et par entreprise.
create unique index if not exists employee_access_removal_requests_one_pending
  on public.employee_access_removal_requests(company_id, user_id) where status = 'pending';
alter table public.employee_access_removal_requests enable row level security;
revoke all on table public.employee_access_removal_requests from anon, authenticated;

-- Dépôt de la demande par l'employé : ligne de demande + notification aux admins.
create or replace function public.request_employee_access_removal(p_company_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_full_name text;
  v_body text;
  v_is_employee boolean;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;

  select exists(
    select 1 from public.memberships m
    join public.roles r on r.id=m.role_id
    where m.user_id=auth.uid() and m.company_id=p_company_id and m.is_active and r.code='employee'
  ) into v_is_employee;
  if not v_is_employee then
    raise exception 'Aucun accès employé actif n''a été trouvé pour cette entreprise.';
  end if;

  if exists(select 1 from public.employee_access_removal_requests
            where company_id=p_company_id and user_id=auth.uid() and status='pending') then
    raise exception 'Une demande de retrait est déjà en cours.';
  end if;

  insert into public.employee_access_removal_requests(company_id,user_id,reason)
  values(p_company_id,auth.uid(),nullif(trim(p_reason),''));

  select full_name into v_full_name from public.profiles where id=auth.uid();
  v_body := coalesce(nullif(trim(v_full_name),''),'Un employé')||' souhaite que son accès à cette entreprise soit retiré.';
  if p_reason is not null and trim(p_reason)<>'' then
    v_body := v_body||E'\nMotif : '||trim(p_reason);
  end if;

  insert into public.notifications(company_id,user_id,title,body,type,created_by)
  select p_company_id, m.user_id, 'Demande de retrait d''accès employé', v_body, 'employee_access_removal_request', auth.uid()
  from public.memberships m
  join public.roles r on r.id=m.role_id
  where m.company_id=p_company_id and m.is_active and r.code='company_admin';
end
$$;

-- Dernière demande de l'employé pour cette entreprise (statut compris), pour
-- afficher "en cours" / "refusée" côté employé. Le type de retour change : on
-- doit donc supprimer puis recréer la fonction.
drop function if exists public.get_my_employee_access_removal_request(uuid);
create function public.get_my_employee_access_removal_request(p_company_id uuid)
returns table(id uuid, created_at timestamptz, status text, review_note text)
language sql
stable
security definer
set search_path=public
as $$
  select q.id, q.created_at, q.status, q.review_note
  from public.employee_access_removal_requests q
  where q.company_id = p_company_id and q.user_id = auth.uid()
  order by q.created_at desc
  limit 1
$$;
grant execute on function public.get_my_employee_access_removal_request(uuid) to authenticated;
revoke all on function public.get_my_employee_access_removal_request(uuid) from anon;

-- Demandes en attente de l'entreprise, pour l'écran Employés de l'administrateur.
create or replace function public.list_employee_access_removal_requests(p_company_id uuid)
returns table(id uuid, user_id uuid, reason text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if not (public.is_business_owner(p_company_id) or public.is_company_admin(p_company_id)) then
    raise exception 'Accès Administrateur requis';
  end if;
  return query
    select q.id, q.user_id, q.reason, q.created_at
    from public.employee_access_removal_requests q
    where q.company_id = p_company_id and q.status = 'pending'
    order by q.created_at;
end
$$;
grant execute on function public.list_employee_access_removal_requests(uuid) to authenticated;
revoke all on function public.list_employee_access_removal_requests(uuid) from anon;

-- Approbation (retire l'accès via delete_employee, qui garde ses propres
-- contrôles et son journal d'audit) ou refus (l'employé est notifié et peut
-- déposer une nouvelle demande).
create or replace function public.process_employee_access_removal_request(p_request_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_request public.employee_access_removal_requests%rowtype;
  v_membership uuid;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  select * into v_request from public.employee_access_removal_requests where id=p_request_id for update;
  if v_request.id is null then raise exception 'Demande introuvable.'; end if;
  if not (public.is_business_owner(v_request.company_id) or public.is_company_admin(v_request.company_id)) then
    raise exception 'Accès Administrateur requis';
  end if;
  if v_request.status <> 'pending' then raise exception 'Cette demande a déjà été traitée.'; end if;

  if p_approve then
    select m.id into v_membership
    from public.memberships m join public.roles r on r.id=m.role_id
    where m.company_id=v_request.company_id and m.user_id=v_request.user_id and r.code='employee'
    limit 1;
    if v_membership is not null then
      perform public.delete_employee(v_membership, coalesce(nullif(trim(p_note),''), 'Demande de retrait de l''employé approuvée'));
    end if;
    update public.employee_access_removal_requests
      set status='approved', review_note=nullif(trim(p_note),''), processed_at=now(), processed_by=auth.uid()
      where id=p_request_id;
  else
    update public.employee_access_removal_requests
      set status='rejected', review_note=nullif(trim(p_note),''), processed_at=now(), processed_by=auth.uid()
      where id=p_request_id;
    -- email_enabled=false : sinon enqueue_notification_email enverrait aussi un
    -- email à chaque administrateur pour une décision qu'il vient lui-même de prendre.
    insert into public.notifications(company_id,user_id,title,body,type,created_by,email_enabled)
    values(v_request.company_id, v_request.user_id, 'Demande de retrait refusée',
      'Votre demande de retrait d''accès a été refusée par l''administrateur.'
        || case when nullif(trim(p_note),'') is not null then E'\nMotif : '||trim(p_note) else '' end,
      'employee_access_removal_rejected', auth.uid(), false);
  end if;
end
$$;
grant execute on function public.process_employee_access_removal_request(uuid,boolean,text) to authenticated;
revoke all on function public.process_employee_access_removal_request(uuid,boolean,text) from anon;

notify pgrst,'reload schema';
commit;
