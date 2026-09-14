begin;

-- Diagnostic élargi : tous les triggers déclenchés sur DELETE, toutes
-- tables confondues, avec le nom de leur fonction — pour trouver celui
-- qui écrit dans audit_logs pendant la suppression en cascade d'une
-- entreprise, sans deviner table par table.
create or replace function public.super_admin_list_delete_triggers()
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_agg(jsonb_build_object(
    'table',c.relname,'trigger_name',t.tgname,'function',p.proname
  ))
  from pg_trigger t
  join pg_class c on c.oid=t.tgrelid
  join pg_namespace n on n.oid=c.relnamespace
  join pg_proc p on p.oid=t.tgfoid
  where n.nspname='public' and not t.tgisinternal and (t.tgtype::int & 8)>0 and public.is_super_admin()
$$;
grant execute on function public.super_admin_list_delete_triggers() to authenticated;
revoke all on function public.super_admin_list_delete_triggers() from anon;

notify pgrst,'reload schema';
commit;
