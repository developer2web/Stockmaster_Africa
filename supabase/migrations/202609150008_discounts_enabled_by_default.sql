begin;

-- allow_discounts valait false par défaut depuis sa création (202608100006)
-- : chaque nouvelle entreprise devait aller l'activer elle-même dans
-- Entreprise avant de pouvoir proposer une remise, ce qui donnait
-- l'impression que la fonctionnalité avait disparu. Décision du
-- propriétaire (15/09) : activé par défaut pour les nouvelles entreprises.
-- Les entreprises déjà créées ne sont volontairement pas modifiées (leur
-- choix explicite ou implicite est respecté) — seul le défaut change pour
-- les prochaines.
alter table public.companies alter column allow_discounts set default true;

commit;
