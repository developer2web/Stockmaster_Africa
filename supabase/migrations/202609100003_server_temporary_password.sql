-- Client-editable metadata must never decide whether the temporary credential
-- has been replaced. Preserve the existing requirement during rollout.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('must_change_password', true)
where raw_user_meta_data->>'must_change_password' = 'true'
  and not (coalesce(raw_app_meta_data, '{}'::jsonb) ? 'must_change_password');

-- The API security gate in 202609100004 reads this server-owned state from
-- auth.users, rather than trusting stale JWT/user_metadata values.
