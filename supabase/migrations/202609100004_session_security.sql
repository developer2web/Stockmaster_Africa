-- Enforce configured MFA and server-owned temporary-password state on every
-- Data API call (including SECURITY DEFINER RPCs), plus Storage/Realtime RLS.
begin;
create or replace function public.session_security_satisfied(p_allow_temporary_password boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from auth.users u where u.id=(select auth.uid())
      and (p_allow_temporary_password or coalesce(u.raw_app_meta_data->>'must_change_password','false') <> 'true')
      and (
        (select auth.jwt()->>'aal')='aal2'
        or not exists(select 1 from auth.mfa_factors f where f.user_id=u.id and f.status='verified')
      )
  );
$$;
revoke all on function public.session_security_satisfied(boolean) from public,anon;
grant execute on function public.session_security_satisfied(boolean) to authenticated;

create or replace function public.assert_session_security(p_allow_temporary_password boolean default false)
returns void language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception using errcode='42501',message='Connexion requise.'; end if;
  if not public.session_security_satisfied(true) then
    raise exception using errcode='42501',message='Confirmez la double authentification pour continuer.',detail='MFA_REQUIRED';
  end if;
  if not p_allow_temporary_password and not public.session_security_satisfied(false) then
    raise exception using errcode='42501',message='Remplacez votre mot de passe temporaire pour continuer.',detail='PASSWORD_CHANGE_REQUIRED';
  end if;
end;
$$;
revoke all on function public.assert_session_security(boolean) from public,anon;
grant execute on function public.assert_session_security(boolean) to authenticated;

create or replace function public.check_request_security()
returns void language plpgsql stable security definer set search_path='' as $$
begin
  -- The assertion endpoint returns no business data. It is also used by the
  -- password replacement function while the user's temporary password is set.
  if auth.role()='authenticated'
     and coalesce(current_setting('request.path',true),'') <> '/rpc/assert_session_security' then
    perform public.assert_session_security(false);
  end if;
end;
$$;
revoke all on function public.check_request_security() from public;
grant execute on function public.check_request_security() to anon,authenticated,service_role;
alter role authenticator set pgrst.db_pre_request = 'public.check_request_security';

-- Restrictive policies cannot be overridden by another permissive tenant rule.
-- Do not add access: existing company/store/permission rules still apply.
do $$
declare target record;
begin
  for target in
    select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind in ('r','p') and c.relrowsecurity
      and (n.nspname='public' or (n.nspname='storage' and c.relname='objects'))
  loop
    execute format('drop policy if exists session_security_required on %I.%I',target.nspname,target.relname);
    execute format('create policy session_security_required on %I.%I as restrictive for all to authenticated using ((select public.session_security_satisfied(false))) with check ((select public.session_security_satisfied(false)))',target.nspname,target.relname);
  end loop;
end;
$$;
notify pgrst,'reload config';
notify pgrst,'reload schema';
commit;
