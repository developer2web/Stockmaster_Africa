begin;

-- Diagnostic Super Admin en lecture seule : liste les index existants sur
-- une table donnée, directement depuis pg_indexes (fiable, contrairement
-- à une recherche dans l'historique des migrations).
create or replace function public.super_admin_list_indexes(p_table text)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_agg(jsonb_build_object('name',indexname,'definition',indexdef))
  from pg_indexes
  where schemaname='public' and tablename=p_table and public.is_super_admin()
$$;
grant execute on function public.super_admin_list_indexes(text) to authenticated;
revoke all on function public.super_admin_list_indexes(text) from anon;

notify pgrst,'reload schema';
commit;
