-- One-off development reset requested on 2026-07-25.
-- Only account creation timestamps are rebased. Business operations and audit
-- records keep their original dates.

do $$
declare
  v_rebased_at timestamptz := now();
begin
  update auth.users
  set created_at = v_rebased_at;

  update public.profiles
  set created_at = v_rebased_at;

  update public.memberships
  set created_at = v_rebased_at;
end;
$$;
