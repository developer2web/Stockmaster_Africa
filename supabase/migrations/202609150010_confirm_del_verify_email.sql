begin;
-- Action ponctuelle : confirme l'email d'un compte de test jetable pour
-- vérifier en direct la nouvelle suppression de compte employé (15/09).
update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now())
where email = 'moustapha.amir.diallo+delverify@gmail.com';
commit;
