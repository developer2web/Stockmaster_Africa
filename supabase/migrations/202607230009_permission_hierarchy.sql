-- Une permission d'écriture inclut la lecture du même module.
create or replace function public.has_permission(p_company uuid,p_code text)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select public.is_super_admin() or exists(
    select 1
    from memberships m
    join companies c on c.id=m.company_id
    join roles r on r.id=m.role_id
    left join role_permissions rp on rp.role_id=r.id
    left join permissions p on p.id=rp.permission_id
    where m.user_id=auth.uid()
      and m.company_id=p_company
      and m.is_active
      and c.is_active
      and (
        r.code='company_admin'
        or p.code=p_code
        or (p_code like '%.read' and p.code=regexp_replace(p_code,'\.read$','.write'))
      )
  )
$$;
