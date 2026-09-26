-- Durcissement des droits d'exécution (demande du propriétaire, 26/09).
--
-- Constat : sur 209 fonctions du schéma public, 179 restaient exécutables par le
-- rôle anon (visiteur non connecté). Les migrations faisaient bien
-- « revoke ... from anon », mais le droit EXECUTE accordé par défaut à PUBLIC
-- (dont anon hérite) n'était jamais retiré — le revoke n'avait donc aucun effet.
-- Pas de faille active (chaque fonction sensible rejette auth.uid() nul), mais
-- aucune raison de les laisser appelables sans connexion.
--
-- Ce qui change, UNIQUEMENT pour les fonctions qui accordent encore EXECUTE à
-- PUBLIC :
--   * EXECUTE retiré à PUBLIC et à anon ;
--   * EXECUTE accordé explicitement à authenticated et service_role, qui en
--     bénéficiaient déjà via PUBLIC : aucun utilisateur connecté, aucune fonction
--     Edge ni aucun job ne perd un accès qu'il avait.
-- Les fonctions déjà restreintes (sans PUBLIC) ne sont pas touchées.
--
-- Seules exceptions laissées accessibles sans connexion (vérifié dans tout le
-- code : ce sont les deux seuls appels RPC faits avant connexion) :
--   * list_public_plans()      — site public (grille des tarifs) ;
--   * auth_email_exists(text)  — écran « Mot de passe oublié ».
-- Aucune politique RLS des tables applicatives ne vise anon ou PUBLIC : les
-- fonctions utilisées dans les politiques n'ont donc pas besoin d'anon.
begin;

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind in ('f', 'p')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and exists (
        select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where a.grantee = 0 and a.privilege_type = 'EXECUTE'
      )
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end $$;

grant execute on function public.list_public_plans() to anon;
grant execute on function public.auth_email_exists(text) to anon;

-- Fonctions créées par les futures migrations : plus d'EXECUTE implicite pour
-- PUBLIC/anon ; authenticated et service_role le reçoivent automatiquement.
-- Le EXECUTE à PUBLIC est un défaut GLOBAL de Postgres : une règle « in schema »
-- ne peut qu'ajouter des droits à ce défaut, pas le retirer — d'où la forme globale.
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public grant execute on functions to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
