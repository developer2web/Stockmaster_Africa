-- Diagnostic Super Admin, lecture seule : liste toutes les surcharges d'une
-- fonction par son nom (utile quand super_admin_debug_function_source
-- échoue sur une ambiguïté "more than one function named ..." — arrive
-- quand une ancienne signature n'a jamais été explicitement supprimée).
-- Renvoie directement le code source de chacune, pas juste sa signature.
create or replace function public.super_admin_function_overloads(p_name text)
returns table(identity_args text, source text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Accès Super Admin requis'; end if;
  return query
  select pg_get_function_identity_arguments(p.oid), pg_get_functiondef(p.oid)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = p_name
  order by identity_args;
end;
$$;
revoke all on function public.super_admin_function_overloads(text) from public, anon, authenticated;
grant execute on function public.super_admin_function_overloads(text) to authenticated;
