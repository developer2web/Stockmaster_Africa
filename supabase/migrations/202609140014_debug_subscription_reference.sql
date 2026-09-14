begin;

create or replace function public.super_admin_debug_subscriptions(p_user_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_agg(to_jsonb(s))
  from public.subscriptions s
  where public.is_super_admin() and (s.created_by=p_user_id or s.client_id=p_user_id)
$$;
grant execute on function public.super_admin_debug_subscriptions(uuid) to authenticated;
revoke all on function public.super_admin_debug_subscriptions(uuid) from anon;

notify pgrst,'reload schema';
commit;
