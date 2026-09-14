begin;

create or replace function public.super_admin_list_triggers(p_table text)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_agg(jsonb_build_object(
    'trigger_name',t.tgname,'timing',case when t.tgtype&2>0 then 'BEFORE' else 'AFTER' end,
    'event',case when t.tgtype&4>0 then 'INSERT' when t.tgtype&8>0 then 'DELETE' when t.tgtype&16>0 then 'UPDATE' else '?' end,
    'function',p.proname
  ))
  from pg_trigger t
  join pg_class c on c.oid=t.tgrelid
  join pg_proc p on p.oid=t.tgfoid
  where c.relname=p_table and not t.tgisinternal and public.is_super_admin()
$$;
grant execute on function public.super_admin_list_triggers(text) to authenticated;
revoke all on function public.super_admin_list_triggers(text) from anon;

notify pgrst,'reload schema';
commit;
