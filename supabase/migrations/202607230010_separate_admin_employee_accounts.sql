-- Un compte d'authentification appartient à un seul portail :
-- administrateur ou employé. Cette règle est appliquée en base et ne dépend
-- donc pas uniquement des formulaires de connexion.

create or replace function public.enforce_account_portal_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_code public.app_role;
  v_conflicting_code public.app_role;
begin
  select r.code into v_new_code
  from public.roles r
  where r.id = new.role_id;

  if v_new_code not in ('company_admin', 'employee') then
    return new;
  end if;

  select r.code into v_conflicting_code
  from public.memberships m
  join public.roles r on r.id = m.role_id
  where m.user_id = new.user_id
    and m.id is distinct from new.id
    and r.code in ('company_admin', 'employee')
    and r.code <> v_new_code
  limit 1;

  if v_conflicting_code is not null then
    raise exception using
      message = case
        when v_new_code = 'employee'
          then 'Cet email appartient déjà à un administrateur. Utilisez une autre adresse pour l''employé.'
        else 'Cet email appartient déjà à un employé. Utilisez une autre adresse pour l''administrateur.'
      end,
      errcode = '23514';
  end if;

  if v_new_code = 'employee' and exists (
    select 1 from public.profiles p
    where p.id = new.user_id and p.is_super_admin
  ) then
    raise exception using
      message = 'Le compte Super Administrateur ne peut pas devenir employé.',
      errcode = '23514';
  end if;

  return new;
end;
$$;
drop trigger if exists memberships_separate_account_portals on public.memberships;
create trigger memberships_separate_account_portals
before insert or update of user_id, role_id on public.memberships
for each row execute function public.enforce_account_portal_role();
revoke all on function public.enforce_account_portal_role() from public;
