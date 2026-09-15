-- Diagnostic Super Admin, lecture seule : recherche d'entreprises par motif
-- de nom (utile pour repérer tous les résidus d'un lot de comptes de test
-- avant nettoyage, sans dépendre du contexte RLS d'un seul utilisateur).
create or replace function public.super_admin_companies_matching(p_pattern text)
returns table(id uuid, name text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Accès Super Admin requis'; end if;
  return query
  select c.id, c.name, c.created_at from companies c
  where c.name ilike '%'||p_pattern||'%'
  order by c.created_at desc limit 50;
end;
$$;
revoke all on function public.super_admin_companies_matching(text) from public, anon, authenticated;
grant execute on function public.super_admin_companies_matching(text) to authenticated;
