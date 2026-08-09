-- Edge Functions use the service_role through PostgREST. RLS is bypassed by that
-- role, but explicit table privileges are still required.

grant select on public.plans, public.plan_features, public.profiles,
  public.client_businesses, public.companies
to service_role;

grant select, insert, update on public.subscriptions,
  public.payment_transactions, public.payment_status_log,
  public.subscription_usage
to service_role;

grant usage, select on all sequences in schema public to service_role;
