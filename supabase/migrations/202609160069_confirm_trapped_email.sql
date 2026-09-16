begin;

-- Confirmation manuelle de l'e-mail du compte de test jetable utilisé
-- pour vérifier en direct le blocage "abonnement expiré" (16/09).
-- Compte à retirer après vérification.
update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now())
where email = 'moustapha.amir.diallo+trapped@gmail.com';

commit;
