-- Diagnostic uniquement : liste tous les triggers réellement actifs sur
-- subscriptions et companies, pour comprendre pourquoi le plan choisi par
-- create_business ne se reflète pas dans la ligne finale.
create or replace function public.super_admin_table_triggers(p_table text)
returns table(trigger_name text, trigger_timing text, trigger_event text, action_statement text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Accès Super Admin requis'; end if;
  return query
  select t.trigger_name::text, t.action_timing::text, t.event_manipulation::text, t.action_statement::text
  from information_schema.triggers t
  where t.event_object_schema='public' and t.event_object_table=p_table
  order by t.trigger_name, t.event_manipulation;
end;
$$;
revoke all on function public.super_admin_table_triggers(text) from public, anon, authenticated;
grant execute on function public.super_admin_table_triggers(text) to authenticated;
