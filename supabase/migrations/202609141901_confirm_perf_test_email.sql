begin;

-- Action ponctuelle, pas un changement de schéma : confirme l'email d'un
-- compte de test jetable créé pour le test de performance du 14/09
-- (moustapha.amir.diallo+perftest@gmail.com), pour pouvoir s'y connecter
-- sans dépendre de la réception réelle de l'email de confirmation. Ne
-- touche strictement qu'à cette adresse précise.
update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now())
where email = 'moustapha.amir.diallo+perftest@gmail.com';

commit;
