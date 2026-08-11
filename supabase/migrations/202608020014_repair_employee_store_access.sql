-- Repair legacy employee memberships whose primary store was never copied to
-- membership_stores, and keep the access predicate backward compatible.

-- A non-global employee in a company with exactly one active store can safely
-- inherit that store when both assignment fields are empty.
update public.memberships m
set store_id = (
  select s.id from public.stores s
  where s.company_id = m.company_id and s.is_active
  limit 1
)
where not m.all_stores
  and m.store_id is null
  and (select count(*) from public.stores s where s.company_id = m.company_id and s.is_active) = 1
  and not exists (
    select 1 from public.membership_stores ms where ms.membership_id = m.id
  );
insert into public.membership_stores(company_id, membership_id, store_id, created_by)
select m.company_id, m.id, m.store_id, coalesce(m.created_by, m.user_id)
from public.memberships m
join public.stores s
  on s.id = m.store_id and s.company_id = m.company_id and s.is_active
where not m.all_stores and m.store_id is not null
on conflict (membership_id, store_id) do nothing;
create or replace function public.can_access_store(p_company uuid, p_store uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin() or public.is_business_owner(p_company) or exists (
    select 1
    from memberships m
    join companies c on c.id = m.company_id and c.is_active
    where m.user_id = auth.uid()
      and m.company_id = p_company
      and m.is_active
      and (
        m.all_stores
        or m.store_id = p_store
        or exists (
          select 1
          from membership_stores ms
          where ms.membership_id = m.id
            and ms.store_id = p_store
            and ms.company_id = p_company
        )
      )
  )
$$;
grant execute on function public.can_access_store(uuid, uuid) to authenticated;
revoke all on function public.can_access_store(uuid, uuid) from anon;
