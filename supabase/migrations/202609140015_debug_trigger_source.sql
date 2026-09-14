begin;

create or replace function public.super_admin_debug_function_source(p_function text)
returns text language sql stable security definer set search_path=public as $$
  select case when public.is_super_admin() then pg_get_functiondef(p_function::regproc) else null end
$$;
grant execute on function public.super_admin_debug_function_source(text) to authenticated;
revoke all on function public.super_admin_debug_function_source(text) from anon;

notify pgrst,'reload schema';
commit;
