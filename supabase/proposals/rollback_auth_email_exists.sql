begin;
drop function if exists public.auth_email_exists(text);
notify pgrst,'reload schema';
commit;
