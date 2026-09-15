-- Diagnostic Super Admin, lecture seule : les réponses HTTP les plus
-- récentes capturées par pg_net (utilisé pour les appels cron -> Edge
-- Functions). Sert ici à vérifier en direct le contenu exact renvoyé par
-- reconcile-stripe-payments ; reste utile ensuite pour tout futur appel
-- cron -> fonction du même genre. p_limit borné pour rester un diagnostic
-- léger, jamais un export de masse.
create or replace function public.super_admin_recent_http_responses(p_limit int default 5)
returns table(status_code int, content text, created timestamptz)
language plpgsql stable security definer set search_path = public, extensions, net as $$
begin
  if not public.is_super_admin() then raise exception 'Accès Super Admin requis'; end if;
  return query
  select r.status_code, r.content, r.created
  from net._http_response r
  order by r.created desc
  limit least(greatest(coalesce(p_limit,5),1),100);
end;
$$;
revoke all on function public.super_admin_recent_http_responses(int) from public, anon, authenticated;
grant execute on function public.super_admin_recent_http_responses(int) to authenticated;
