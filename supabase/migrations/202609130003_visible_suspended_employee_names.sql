-- shares_company_with() required the TARGET membership to be active,
-- not just the viewer's own. Found live: suspending an employee makes
-- their real name disappear everywhere it's joined through profiles
-- (employee management list, and any historical record — sales,
-- audit log, movements — that shows "created_by"), falling back to a
-- generic "Employé" label. A manager should still be able to identify
-- who they suspended, and historical records should never go anonymous
-- just because the person later left or was suspended. The viewer's own
-- active membership + permission is what should gate this, not the
-- target's current status — suspension already controls that person's
-- own access (login, actions), which is a separate concern from whether
-- their name stays visible to people who manage/managed them.
create or replace function public.shares_company_with(p_user uuid)
returns boolean language sql stable security definer set search_path='public' as $$
  select public.is_super_admin() or exists (
    select 1 from memberships mine
    join memberships theirs on theirs.company_id = mine.company_id
    where mine.user_id = auth.uid() and mine.is_active
      and theirs.user_id = p_user
      and public.has_permission(mine.company_id, 'memberships.read')
  )
$$;
notify pgrst, 'reload schema';
