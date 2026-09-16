begin;

-- Réinitialisation directe du mot de passe du compte Super Admin
-- (stockmaster.africa@gmail.com), demandée explicitement par le
-- propriétaire après échec du lien de récupération par e-mail (16/09).
-- Le mot de passe est généré ICI, à l'intérieur de Postgres, avec
-- pgcrypto (gen_random_bytes + crypt/gen_salt('bf'), le même hachage
-- bcrypt que GoTrue écrit lui-même dans auth.users.encrypted_password)
-- — il n'apparaît jamais en clair dans ce fichier ni dans l'historique
-- git, seulement dans le résultat (NOTICE) de cette exécution unique.
do $$
declare
  v_new_password text;
  v_updated integer;
begin
  v_new_password := encode(extensions.gen_random_bytes(15), 'base64');

  update auth.users
  set encrypted_password = extensions.crypt(v_new_password, extensions.gen_salt('bf')),
      updated_at = now()
  where email = 'stockmaster.africa@gmail.com';

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'Aucun compte auth.users trouvé pour stockmaster.africa@gmail.com — mot de passe non modifié.';
  end if;

  raise notice 'NEW_PASSWORD=%', v_new_password;
end $$;

commit;
