begin;

create or replace function public.super_admin_list_columns(p_table text)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_agg(jsonb_build_object('column',column_name,'type',data_type,'nullable',is_nullable))
  from information_schema.columns
  where table_schema='public' and table_name=p_table and public.is_super_admin()
$$;
grant execute on function public.super_admin_list_columns(text) to authenticated;
revoke all on function public.super_admin_list_columns(text) from anon;

notify pgrst,'reload schema';
commit;
