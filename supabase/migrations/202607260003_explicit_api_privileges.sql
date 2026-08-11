-- PostgreSQL privileges and RLS are separate layers. Grant access to reach the
-- policies; RLS continues to decide which rows each authenticated user sees.
grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;
-- The email directory is service-role only and must never be exposed through
-- the client API, even though it has RLS enabled.
revoke all on public.user_email_directory from anon, authenticated;
-- Client-managed entities. Financial and stock creation remains RPC-only.
grant insert, update, delete on
  public.categories,
  public.products,
  public.product_variants,
  public.suppliers,
  public.customers
to authenticated;
grant insert, update on public.stores to authenticated;
grant update on public.profiles, public.companies to authenticated;
grant delete on public.expenses to authenticated;
-- Keep server-authoritative tables read-only from the client.
revoke insert, update, delete on
  public.sales,
  public.sale_items,
  public.stock_levels,
  public.stock_movements,
  public.cash_transactions,
  public.currency_exchange_rates,
  public.currency_change_audit,
  public.app_error_events
from authenticated;
