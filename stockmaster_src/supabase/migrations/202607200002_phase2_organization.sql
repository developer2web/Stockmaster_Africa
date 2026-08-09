-- StockMaster Phase 2 - companies, stores, custom employee roles and invitations

alter table public.roles drop constraint if exists roles_company_id_code_key;
create unique index if not exists roles_company_name_unique on public.roles(company_id, lower(name));
create unique index if not exists roles_one_admin_per_company on public.roles(company_id) where code = 'company_admin';

create or replace function public.shares_company_with(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or exists (
    select 1 from memberships mine
    join memberships theirs on theirs.company_id = mine.company_id
    where mine.user_id = auth.uid() and mine.is_active
      and theirs.user_id = p_user and theirs.is_active
      and public.has_permission(mine.company_id, 'memberships.read')
  )
$$;

drop policy if exists profiles_self_or_super on public.profiles;
create policy profiles_company_select on public.profiles for select to authenticated
using (id = auth.uid() or public.shares_company_with(id));

-- Explicit Phase 2 permissions. Company administrators bypass these through has_permission().
insert into public.permissions(code, description) values
  ('company.manage', 'Modifier les informations de l’entreprise'),
  ('stores.read', 'Consulter les boutiques'),
  ('stores.write', 'Créer et modifier les boutiques'),
  ('roles.read', 'Consulter les rôles'),
  ('roles.write', 'Créer et modifier les rôles'),
  ('role_permissions.read', 'Consulter les permissions des rôles'),
  ('role_permissions.write', 'Modifier les permissions des rôles'),
  ('memberships.read', 'Consulter les employés'),
  ('memberships.write', 'Inviter et gérer les employés')
on conflict (code) do update set description = excluded.description;

create or replace function public.create_employee_role(p_name text, p_permission_codes text[])
returns uuid language plpgsql security definer set search_path = public as $$
declare v_company uuid; v_role uuid;
begin
  select m.company_id into v_company from memberships m join roles r on r.id=m.role_id
  where m.user_id=auth.uid() and m.is_active and r.code='company_admin' limit 1;
  if v_company is null or not public.has_active_subscription(v_company) then raise exception 'Accès refusé ou abonnement inactif'; end if;
  insert into roles(company_id,name,code,created_by) values(v_company,trim(p_name),'employee',auth.uid()) returning id into v_role;
  insert into role_permissions(company_id,role_id,permission_id,created_by)
  select v_company,v_role,p.id,auth.uid() from permissions p where p.code=any(p_permission_codes);
  return v_role;
end $$;

create or replace function public.update_employee_role(p_role_id uuid, p_name text, p_permission_codes text[])
returns void language plpgsql security definer set search_path = public as $$
declare v_company uuid;
begin
  select company_id into v_company from roles where id=p_role_id and code='employee';
  if v_company is null or not public.has_permission(v_company,'roles.write') or not public.has_active_subscription(v_company) then raise exception 'Accès refusé'; end if;
  update roles set name=trim(p_name) where id=p_role_id;
  delete from role_permissions where role_id=p_role_id;
  insert into role_permissions(company_id,role_id,permission_id,created_by)
  select v_company,p_role_id,p.id,auth.uid() from permissions p where p.code=any(p_permission_codes);
end $$;

create or replace function public.delete_employee_role(p_role_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_company uuid;
begin
  select company_id into v_company from roles where id=p_role_id and code='employee';
  if v_company is null or not public.has_permission(v_company,'roles.write') or not public.has_active_subscription(v_company) then raise exception 'Accès refusé'; end if;
  if exists(select 1 from memberships where role_id=p_role_id) then raise exception 'Ce rôle est encore attribué à un employé'; end if;
  delete from roles where id=p_role_id;
end $$;

grant execute on function public.create_employee_role(text,text[]) to authenticated;
grant execute on function public.update_employee_role(uuid,text,text[]) to authenticated;
grant execute on function public.delete_employee_role(uuid) to authenticated;

-- Realtime for Phase 2 administrative lists.
do $$ begin
  alter publication supabase_realtime add table public.stores;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.memberships;
exception when duplicate_object then null; end $$;
