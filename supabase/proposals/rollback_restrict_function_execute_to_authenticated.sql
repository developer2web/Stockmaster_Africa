-- Rétablit EXECUTE pour PUBLIC sur toutes les fonctions du schéma public qui
-- l'avaient avant 202609260004 (état antérieur : toutes celles qui accordent
-- aujourd'hui EXECUTE explicitement à authenticated). Plus large que l'état
-- initial pour les quelques fonctions déjà restreintes : à n'utiliser qu'en
-- dernier recours si un appel légitime non connecté a été oublié.
begin;
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind in ('f','p')
      and exists (select 1 from aclexplode(p.proacl) a join pg_roles r on r.oid = a.grantee
                  where r.rolname = 'authenticated' and a.privilege_type = 'EXECUTE')
  loop
    execute format('grant execute on function %s to public', f.sig);
  end loop;
end $$;
alter default privileges grant execute on functions to public;
notify pgrst, 'reload schema';
commit;
