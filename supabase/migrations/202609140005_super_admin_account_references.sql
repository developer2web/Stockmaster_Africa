begin;

-- Lecture seule : dit exactement ce qui retient un compte avant toute
-- suppression physique, pour savoir précisément ce que ça changerait
-- ailleurs (au lieu de deviner).
create or replace function public.super_admin_account_references(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_result jsonb;
begin
  if not public.is_super_admin() then raise exception 'Accès Super Admin requis' using errcode='42501'; end if;
  select jsonb_build_object(
    'sales', (select count(*) from public.sales where created_by=p_user_id),
    'sale_items', (select count(*) from public.sale_items where created_by=p_user_id),
    'stock_movements', (select count(*) from public.stock_movements where created_by=p_user_id),
    'products', (select count(*) from public.products where created_by=p_user_id),
    'purchases', (select count(*) from public.purchases where created_by=p_user_id),
    'expenses', (select count(*) from public.expenses where created_by=p_user_id),
    'cash_transactions', (select count(*) from public.cash_transactions where created_by=p_user_id),
    'active_memberships', (select count(*) from public.memberships where user_id=p_user_id and is_active),
    'total_memberships', (select count(*) from public.memberships where user_id=p_user_id),
    'payment_transactions_succeeded', (select count(*) from public.payment_transactions where client_id=p_user_id and status='succeeded')
  ) into v_result;
  return v_result;
end $$;
grant execute on function public.super_admin_account_references(uuid) to authenticated;
revoke all on function public.super_admin_account_references(uuid) from anon;

notify pgrst,'reload schema';
commit;
