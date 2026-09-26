-- Décision explicite du propriétaire (26/09) : l'écran "Mot de passe oublié" doit
-- dire clairement si l'adresse saisie n'a pas de compte (et proposer d'en créer un),
-- au lieu du message générique anti-énumération mis en place le 25/09. Compromis
-- accepté en connaissance de cause : cela permet à un tiers de tester si une adresse
-- est inscrite. Ne renvoie qu'un booléen — jamais d'identifiant ni d'autre donnée.
begin;

create or replace function public.auth_email_exists(p_email text)
returns boolean
language sql
stable
security definer
set search_path=public, auth
as $$
  select exists(
    select 1 from auth.users u
    where lower(u.email) = lower(trim(coalesce(p_email,'')))
      and u.deleted_at is null
  )
$$;
grant execute on function public.auth_email_exists(text) to anon, authenticated;

notify pgrst,'reload schema';
commit;
