begin;

-- Action ponctuelle : confirme l'email d'un compte de test jetable créé
-- pour vérifier en direct les changements d'interface du 15/09 (grille
-- produits, indicateur panier, bandeau essai, bouton déconnexion...). Ne
-- touche strictement qu'à cette adresse précise.
update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now())
where email = 'moustapha.amir.diallo+uiverify@gmail.com';

commit;
