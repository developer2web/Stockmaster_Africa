begin;

-- Second bug trouvé en creusant le premier (15/09) : is_company_admin()
-- a été redéfinie 5 fois au fil du projet, et chaque passage a corrigé un
-- point en en perdant un autre au passage :
--   - 202608210002 / 202608310001 : ajoutent la vérification que
--     l'entreprise est active / non archivée — jamais de passe-droit
--     Super Admin.
--   - 202609090001 (« Restore the owner-only financial read path ») :
--     ajoute le passe-droit is_super_admin(), mais perd au passage la
--     vérification d'entreprise active/archivée.
--   - 202609100001 (security_privileges) : ramène la vérification
--     d'entreprise, mais reperd le passe-droit Super Admin.
-- Repéré en vérifiant sale_financials en direct après le correctif
-- précédent (voir 202609150003) : même vue corrigée, le Super Admin ne
-- pouvait toujours rien lire (is_company_admin() renvoyait false pour
-- lui). Sans lien avec le bug rapporté par le testeur (un vrai
-- propriétaire passe par sa propre adhésion, jamais par ce passe-droit),
-- mais un vrai manque pour l'audit Super Admin des marges/coûts d'une
-- entreprise. Version ci-dessous : la réunion des deux derniers
-- correctifs, rien retiré cette fois. Cohérent avec le même passe-droit
-- déjà présent sur is_business_owner()/can_access_store()/has_permission()
-- dans le reste du code.
create or replace function public.is_company_admin(p_company_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    public.is_super_admin() or exists (
      select 1 from public.memberships m
      join public.roles r on r.id = m.role_id and r.company_id = m.company_id
      join public.companies c on c.id = m.company_id
        and c.is_active and c.plan_archived_at is null
      where m.user_id = auth.uid() and m.is_active
        and m.company_id = p_company_id and r.code = 'company_admin'
    )
  );
$$;
alter function public.is_company_admin(uuid) owner to postgres;
revoke all on function public.is_company_admin(uuid) from public, anon;
grant execute on function public.is_company_admin(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
