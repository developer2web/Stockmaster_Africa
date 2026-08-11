create or replace function public.get_store_cash_summary(p_store_id uuid)
returns table(deposits numeric, withdrawals numeric, balance numeric)
language sql
stable
security invoker
set search_path=public
as $$
  select
    coalesce(sum(amount) filter (where transaction_type='deposit'),0) as deposits,
    coalesce(sum(amount) filter (where transaction_type='withdrawal'),0) as withdrawals,
    coalesce(sum(
      case when transaction_type='deposit' then amount else -amount end
    ),0) as balance
  from public.cash_transactions
  where store_id=p_store_id
$$;
grant execute on function public.get_store_cash_summary(uuid) to authenticated;
revoke all on function public.get_store_cash_summary(uuid) from anon;
