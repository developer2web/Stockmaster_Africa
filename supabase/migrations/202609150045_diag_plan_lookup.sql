-- Diagnostic uniquement : isole exactement ce que renvoie la recherche de
-- plan utilisée par create_business, pour comprendre pourquoi le nouvel
-- essai continue de démarrer sur Basic malgré la migration précédente.
create or replace function public.super_admin_diag_plan_lookup(p_code text)
returns table(v_plan uuid, plan_code text, plan_name text)
language plpgsql stable security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_super_admin() then raise exception 'Accès Super Admin requis'; end if;
  select id into v_id from subscription_plans where code = p_code;
  return query select v_id, sp.code, sp.name from subscription_plans sp where sp.id = v_id;
end;
$$;
revoke all on function public.super_admin_diag_plan_lookup(text) from public, anon, authenticated;
grant execute on function public.super_admin_diag_plan_lookup(text) to authenticated;
