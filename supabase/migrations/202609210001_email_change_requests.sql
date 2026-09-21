begin;

-- Demande explicite (21/09) : l'email écrit par le propriétaire (email de
-- connexion du compte + email de contact de l'entreprise dans Réglages)
-- doit servir de valeur par défaut partout où un email est affiché, et ne
-- doit plus être modifiable librement par un company_admin — toute
-- modification doit passer par une demande approuvée par le Super Admin.
-- Même schéma que account_deletion_requests (202607270008) + son écran
-- Super Admin (202609120010).
create table public.email_change_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  requested_by uuid not null references public.profiles(id),
  target text not null check (target in ('account_email','company_email')),
  current_email text,
  requested_email text not null,
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid references public.profiles(id),
  processed_note text
);
alter table public.email_change_requests enable row level security;
create policy email_change_requests_select
on public.email_change_requests for select to authenticated
using (public.is_company_admin(company_id) or public.is_super_admin());
grant select on public.email_change_requests to authenticated;

-- Un company_admin dépose une demande (compte "account_email" ou entreprise
-- "company_email"). Une seule demande "pending" à la fois par entreprise et
-- par cible — une nouvelle demande remplace la précédente encore en attente
-- au lieu d'en empiler plusieurs.
create or replace function public.request_email_change(p_company_id uuid, p_target text, p_new_email text, p_reason text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_current text;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if not public.is_company_admin(p_company_id) then raise exception 'Accès administrateur requis' using errcode = '42501'; end if;
  if p_target not in ('account_email','company_email') then raise exception 'Cible invalide'; end if;
  if p_new_email is null or trim(p_new_email) = '' or p_new_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Adresse email invalide'; end if;

  v_current := case p_target
    when 'account_email' then (select email::text from auth.users where id = auth.uid())
    else (select email from public.companies where id = p_company_id)
  end;

  delete from public.email_change_requests where company_id = p_company_id and target = p_target and status = 'pending';
  insert into public.email_change_requests(company_id, requested_by, target, current_email, requested_email, reason)
  values (p_company_id, auth.uid(), p_target, v_current, trim(p_new_email), nullif(trim(p_reason), ''))
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.request_email_change(uuid,text,text,text) to authenticated;
revoke all on function public.request_email_change(uuid,text,text,text) from anon;

create or replace function public.super_admin_email_change_requests()
returns table(
  id uuid, company_id uuid, company_name text, requested_by_name text, target text,
  current_email text, requested_email text, reason text, status text,
  requested_at timestamptz, processed_at timestamptz, processed_by_name text, processed_note text
)
language sql stable security definer set search_path = public as $$
  select r.id, r.company_id, c.name, p.full_name, r.target,
    r.current_email, r.requested_email, r.reason, r.status,
    r.requested_at, r.processed_at, pb.full_name, r.processed_note
  from public.email_change_requests r
  join public.companies c on c.id = r.company_id
  join public.profiles p on p.id = r.requested_by
  left join public.profiles pb on pb.id = r.processed_by
  where public.is_super_admin()
  order by case r.status when 'pending' then 0 else 1 end, r.requested_at desc
$$;
grant execute on function public.super_admin_email_change_requests() to authenticated;
revoke all on function public.super_admin_email_change_requests() from anon;

-- N'écrit jamais directement dans auth.users : changer l'email de connexion
-- d'un compte en contournant le flux de confirmation standard de Supabase
-- Auth risquerait de casser sa session ou de laisser l'état incohérent.
-- Approuver une demande "account_email" débloque seulement l'action côté
-- client (l'admin lui-même appelle alors supabase.auth.updateUser, qui
-- envoie sa propre confirmation par email). "company_email", elle, est une
-- simple colonne applicative : appliquée directement à l'approbation.
create or replace function public.super_admin_review_email_change_request(p_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v_request public.email_change_requests;
begin
  if not public.is_super_admin() then raise exception 'Accès Super Admin requis' using errcode = '42501'; end if;
  perform public.assert_session_security(false);
  if not p_approve and (p_note is null or trim(p_note) = '') then raise exception 'Motif obligatoire pour refuser une demande'; end if;

  select * into v_request from public.email_change_requests where id = p_id and status = 'pending';
  if not found then raise exception 'Demande introuvable ou déjà traitée'; end if;

  if p_approve and v_request.target = 'company_email' then
    update public.companies set email = v_request.requested_email where id = v_request.company_id;
  end if;

  update public.email_change_requests set
    status = case when p_approve then 'approved' else 'rejected' end,
    processed_at = now(), processed_by = auth.uid(), processed_note = nullif(trim(p_note), '')
  where id = p_id;
end $$;
grant execute on function public.super_admin_review_email_change_request(uuid,boolean,text) to authenticated;
revoke all on function public.super_admin_review_email_change_request(uuid,boolean,text) from anon;

-- Marque une demande "account_email" approuvée comme appliquée, une fois que
-- le client a effectivement déclenché supabase.auth.updateUser avec succès.
create or replace function public.acknowledge_email_change_applied(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.email_change_requests set status = 'cancelled', processed_note = coalesce(processed_note,'') || ' [appliqué]'
  where id = p_id and requested_by = auth.uid() and status = 'approved' and target = 'account_email';
end $$;
grant execute on function public.acknowledge_email_change_applied(uuid) to authenticated;
revoke all on function public.acknowledge_email_change_applied(uuid) from anon;

-- Prérempli une bonne fois pour toutes les entreprises créées à partir de
-- maintenant : l'email de contact de l'entreprise part directement de
-- l'email de connexion du Propriétaire au lieu de rester vide jusqu'à ce
-- que quelqu'un le renseigne à la main dans Réglages.
create or replace function public.create_business(
  p_company_name text,
  p_store_name text,
  p_country_code text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_store uuid;
  v_admin uuid;
  v_manager uuid;
  v_plan uuid;
  v_map country_currency_map%rowtype;
  v_owner_email text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(trim(p_company_name)) < 2 or length(trim(p_store_name)) < 2 then
    raise exception 'Nom invalide';
  end if;

  select * into v_map from country_currency_map
  where country_code = upper(trim(p_country_code)) and is_active;
  if not found then raise exception 'Pays non pris en charge'; end if;

  select email::text into v_owner_email from auth.users where id = auth.uid();

  insert into companies(name, country_code, country_name, default_currency_code, email, created_by)
  values(trim(p_company_name), v_map.country_code, v_map.country_name,
    v_map.default_currency_code, v_owner_email, auth.uid())
  returning id into v_company;

  insert into stores(company_id, name, created_by)
  values(v_company, trim(p_store_name), auth.uid()) returning id into v_store;
  insert into roles(company_id, name, code, created_by)
  values(v_company, 'Propriétaire', 'company_admin', auth.uid()) returning id into v_admin;
  insert into memberships(company_id, user_id, role_id, store_id, all_stores, created_by)
  values(v_company, auth.uid(), v_admin, v_store, true, auth.uid());
  insert into client_businesses(client_id, company_id, is_primary, created_by)
  values(auth.uid(), v_company,
    not exists(select 1 from client_businesses where client_id = auth.uid()), auth.uid());
  insert into membership_stores(company_id, membership_id, store_id, created_by)
  select v_company, id, v_store, auth.uid() from memberships
  where company_id = v_company and user_id = auth.uid();

  -- Employé and Comptable are created by the company trigger.
  insert into roles(company_id, name, code, created_by)
  values(v_company, 'Manager', 'employee', auth.uid()) returning id into v_manager;
  insert into role_permissions(company_id, role_id, permission_id, created_by)
  select v_company, v_manager, p.id, auth.uid() from permissions p where p.code in ('notifications.read',
    'stores.read', 'stores.write', 'products.read', 'products.write',
    'categories.read', 'categories.write', 'suppliers.read', 'suppliers.write',
    'product_variants.read', 'product_variants.write',
    'stock_movements.read', 'stock_movements.write',
    'sales.read', 'sales.write', 'expenses.read', 'expenses.write',
    'cash_transactions.read', 'cash_transactions.write',
    'daily_reports.read', 'monthly_reports.read'
  );

  -- Essai gratuit démarré directement sur Pro (voir commentaire en tête de
  -- fichier) : auparavant 'basic'.
  select id into v_plan from subscription_plans where code = 'pro';
  insert into subscriptions(company_id, plan_id, status, trial_ends_at,
    current_period_ends_at, created_by)
  values(v_company, v_plan, 'trialing', now() + interval '14 days',
    now() + interval '14 days', auth.uid());
  return v_company;
end;
$$;
grant execute on function public.create_business(text, text, text) to authenticated;
revoke all on function public.create_business(text, text, text) from anon;

-- Les entreprises déjà créées gardent leur email de contact vide : on le
-- préremplit une bonne fois depuis l'email de connexion du Propriétaire là
-- où il est encore vide, pour que le comportement "préremplie partout"
-- s'applique aussi à l'historique, pas seulement aux nouvelles entreprises.
update public.companies c set email = u.email
from public.memberships m
join public.roles r on r.id = m.role_id and r.code = 'company_admin'
join auth.users u on u.id = m.user_id
where m.company_id = c.id and (c.email is null or c.email = '') and u.email is not null;

-- Verrou côté serveur, indépendant de l'écran : updateBusinessSettings (et
-- tout autre appel direct à `update companies`) passe par un simple UPDATE
-- de table protégé par RLS, pas par une fonction dédiée — retirer le champ
-- du formulaire ne suffit donc pas à empêcher un appel API direct. Seul le
-- chemin approuvé (super_admin_review_email_change_request, qui agit avec
-- auth.uid() = l'identité du Super Admin appelant) peut changer cette
-- colonne ; toute autre tentative de modification est bloquée ici.
create or replace function private.guard_company_email_change()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.email is distinct from old.email and not public.is_super_admin() then
    raise exception 'L’email de l’entreprise ne peut être modifié que via une demande approuvée par le Super Admin.';
  end if;
  return new;
end $$;
drop trigger if exists guard_company_email_change on public.companies;
create trigger guard_company_email_change
before update on public.companies
for each row execute function private.guard_company_email_change();

notify pgrst, 'reload schema';
commit;
