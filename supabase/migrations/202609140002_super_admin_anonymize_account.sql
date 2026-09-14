begin;

-- Un compte ne peut pas être supprimé physiquement : chaque produit, vente ou
-- mouvement de stock garde une référence "créé par" vers profiles(id), sans
-- cascade, pour la comptabilité. C'est ce qui bloquait toute suppression
-- tentée directement dans le tableau de bord Supabase. À la place, ce
-- traitement anonymise : le nom et la photo disparaissent, l'email est
-- remplacé par une valeur non identifiante, le compte est banni (connexion
-- impossible), et chaque accès entreprise est désactivé — mais la ligne
-- profiles elle-même reste, donc les ventes/produits déjà créés restent
-- intacts pour la comptabilité, simplement sans nom rattaché. Correspond à
-- ce que la politique de confidentialité publique promet déjà (données
-- "supprimées ou anonymisées").
create or replace function public.super_admin_anonymize_account(p_request_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_user_id uuid;
begin
  if not public.is_super_admin() then raise exception 'Accès Super Admin requis' using errcode='42501'; end if;
  perform public.assert_session_security(false);

  select user_id into v_user_id from public.account_deletion_requests where id=p_request_id;
  if v_user_id is null then raise exception 'Demande introuvable'; end if;

  update public.profiles
  set full_name='Compte supprimé', avatar_url=null
  where id=v_user_id;

  update public.memberships
  set is_active=false
  where user_id=v_user_id and is_active;

  update auth.users
  set email='deleted+'||v_user_id||'@stockmaster.africa',
    phone=null,
    banned_until=now()+interval '100 years',
    raw_user_meta_data='{}'::jsonb,
    raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)-'must_change_password'
  where id=v_user_id;

  update public.account_deletion_requests
  set status='completed', processed_at=now(), processed_by=auth.uid()
  where id=p_request_id;
end $$;
grant execute on function public.super_admin_anonymize_account(uuid) to authenticated;
revoke all on function public.super_admin_anonymize_account(uuid) from anon;

notify pgrst,'reload schema';
commit;
