begin;

create or replace function public.super_admin_diagnose_view(p_view text)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'owner', (select pg_get_userbyid(c.relowner) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=p_view),
    'reloptions', (select c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=p_view),
    'definition', (select pg_get_viewdef(format('public.%I',p_view)::regclass, true)),
    'grants', (select jsonb_agg(jsonb_build_object('grantee',grantee,'privilege',privilege_type)) from information_schema.role_table_grants where table_schema='public' and table_name=p_view)
  )
  where public.is_super_admin()
$$;
grant execute on function public.super_admin_diagnose_view(text) to authenticated;
revoke all on function public.super_admin_diagnose_view(text) from anon;

notify pgrst,'reload schema';
commit;
