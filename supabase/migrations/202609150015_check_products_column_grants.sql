begin;
create or replace function public.super_admin_column_grants(p_table text)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_agg(jsonb_build_object('column',column_name,'grantee',grantee,'privilege',privilege_type))
  from information_schema.column_privileges
  where table_schema='public' and table_name=p_table and public.is_super_admin()
$$;
grant execute on function public.super_admin_column_grants(text) to authenticated;
revoke all on function public.super_admin_column_grants(text) from anon;
notify pgrst,'reload schema';
commit;
