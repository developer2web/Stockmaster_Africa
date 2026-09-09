-- Restore the owner-only financial read path after a 42501 on sale_financials.
-- The base sales tables keep their restricted financial column grants.
-- These views intentionally use the view owner's privileges: security_invoker
-- would require granting confidential columns to every authenticated employee.
-- The explicit company-admin predicate is the security boundary instead.
begin;

create or replace function public.is_company_admin(p_company_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    public.is_super_admin() or exists (
      select 1 from public.memberships m
      join public.roles r on r.id = m.role_id
      where m.user_id = auth.uid() and m.is_active
        and m.company_id = p_company_id and r.code = 'company_admin'
    )
  );
$$;
alter function public.is_company_admin(uuid) owner to postgres;
revoke all on function public.is_company_admin(uuid) from public, anon;
grant execute on function public.is_company_admin(uuid) to authenticated;

create or replace view public.sale_financials
with (security_barrier = true, security_invoker = false) as
  select s.id as sale_id, s.company_id, s.store_id, s.cost_total, s.gross_profit
  from public.sales s
  where public.is_company_admin(s.company_id);

create or replace view public.sale_item_financials
with (security_barrier = true, security_invoker = false) as
  select si.id as sale_item_id, si.sale_id, s.company_id,
         si.purchase_price_snapshot, si.gross_profit
  from public.sale_items si
  join public.sales s on s.id = si.sale_id
  where public.is_company_admin(s.company_id);

alter view public.sale_financials owner to postgres;
alter view public.sale_item_financials owner to postgres;
revoke all on public.sale_financials, public.sale_item_financials from public, anon;
grant select on public.sale_financials, public.sale_item_financials to authenticated;

notify pgrst, 'reload schema';
commit;
