-- Ajoute un p_limit configurable (borné) à super_admin_recent_http_responses,
-- pour retrouver un appel précis noyé parmi les cron fréquents (ex.
-- notification-email, toutes les minutes) sans changer la signature de base.
-- drop explicite de l'ancienne signature sans paramètre : évite toute
-- ambiguïté PostgREST entre les deux surcharges (même mécanisme que pour
-- create_product_with_initial_stock plus tôt).
drop function if exists public.super_admin_recent_http_responses();
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
