-- Test uniquement : re-déclenche reconcile-stripe-payments immédiatement
-- pour capturer sa réponse sans délai cette fois.
do $$
declare v_secret text;
begin
  select secret into v_secret from private.notification_webhook_secrets where id;
  perform net.http_post(
    url:='https://mwpbinlxablzruvpjjjy.supabase.co/functions/v1/reconcile-stripe-payments',
    headers:=jsonb_build_object('Content-Type','application/json','X-StockMaster-Webhook',v_secret),
    body:='{}'::jsonb,
    timeout_milliseconds:=30000
  );
end $$;
