begin;

-- Diagnostic seulement : interroge le schéma réel plutôt que de deviner à
-- partir de l'historique des migrations (peu fiable, trop de redéfinitions).
create or replace function public.super_admin_check_columns_nullable(p_columns jsonb)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_object_agg(
    tbl||'.'||col,
    (select c.is_nullable from information_schema.columns c
     where c.table_schema='public' and c.table_name=tbl and c.column_name=col)
  )
  from jsonb_array_elements_text(p_columns) as pair,
    lateral (select split_part(pair,'.',1) as tbl, split_part(pair,'.',2) as col) x
  where public.is_super_admin()
$$;
grant execute on function public.super_admin_check_columns_nullable(jsonb) to authenticated;
revoke all on function public.super_admin_check_columns_nullable(jsonb) from anon;

notify pgrst,'reload schema';
commit;
