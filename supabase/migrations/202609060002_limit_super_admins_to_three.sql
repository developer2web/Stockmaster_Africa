-- Keep the platform owner role bounded even when profiles are changed outside
-- the bootstrap Edge Function.
create or replace function public.enforce_super_admin_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_super_admin and (tg_op = 'INSERT' or not old.is_super_admin) then
    if (select count(*) from public.profiles where is_super_admin and id <> new.id) >= 3 then
      raise exception 'La limite de 3 Super Administrateurs est atteinte';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_super_admin_limit on public.profiles;
create trigger profiles_super_admin_limit
before insert or update of is_super_admin on public.profiles
for each row execute function public.enforce_super_admin_limit();