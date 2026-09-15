begin;

create or replace function public.super_admin_list_definer_views()
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_agg(jsonb_build_object('name',c.relname,'reloptions',c.reloptions))
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='v' and public.is_super_admin()
    and exists(select 1 from unnest(coalesce(c.reloptions,'{}')) opt where opt like 'security_invoker=%')
$$;
grant execute on function public.super_admin_list_definer_views() to authenticated;
revoke all on function public.super_admin_list_definer_views() from anon;

notify pgrst,'reload schema';
commit;
