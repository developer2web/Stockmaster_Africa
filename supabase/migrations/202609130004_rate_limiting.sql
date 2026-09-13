-- No edge function currently limits how often a caller can hit it. Adds a
-- small, reusable sliding-window limiter and applies it to the highest-
-- abuse-value target first: create-payment (each call hits Stripe's API
-- and reserves a payment_transactions row). Scoped to be safe to extend to
-- other functions later without a second migration for the primitive.
create table if not exists public.rate_limit_hits (
  bucket_key text not null,
  hit_at timestamptz not null default now()
);
create index if not exists rate_limit_hits_bucket_idx on public.rate_limit_hits(bucket_key, hit_at desc);
alter table public.rate_limit_hits enable row level security;
revoke all on public.rate_limit_hits from public, anon, authenticated;

-- Records one hit and returns whether the caller is still within the
-- allowed count for that key over the trailing window. Callers should
-- record the attempt regardless of outcome (a blocked attempt still
-- counts, otherwise retrying faster would reset the window).
create or replace function public.check_rate_limit(p_bucket_key text, p_max_hits int, p_window interval)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_count int;
begin
  delete from public.rate_limit_hits where hit_at < now() - greatest(p_window, interval '1 hour');
  insert into public.rate_limit_hits(bucket_key) values (p_bucket_key);
  select count(*) into v_count from public.rate_limit_hits
    where bucket_key = p_bucket_key and hit_at >= now() - p_window;
  return v_count <= p_max_hits;
end $$;
revoke all on function public.check_rate_limit(text,int,interval) from public, anon;
grant execute on function public.check_rate_limit(text,int,interval) to authenticated, service_role;
notify pgrst, 'reload schema';
