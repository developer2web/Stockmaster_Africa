begin;
update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now())
where email = 'moustapha.amir.diallo+preload@gmail.com';
commit;
