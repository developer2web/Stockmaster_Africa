-- Rapprochement automatique des paiements Stripe : filet de sécurité si un
-- webhook n'arrive jamais (incident réseau ponctuel côté Stripe ou StockMaster).
-- Toutes les 20 minutes, l'Edge Function reconcile-stripe-payments interroge
-- Stripe directement pour chaque paiement Stripe resté pending/processing
-- depuis plus de 15 minutes, et le corrige via la même RPC que le webhook
-- (process_payment_webhook) si Stripe dit que la session est en fait
-- terminée. Réutilise le secret interne déjà en place pour
-- notification-email (private.notification_webhook_secrets) — même
-- mécanisme d'authentification serveur-à-serveur, pas de nouveau secret.
do $$
declare v_job bigint;v_secret text;
begin
  select secret into v_secret from private.notification_webhook_secrets where id;
  select jobid into v_job from cron.job where jobname='stockmaster-stripe-reconciliation';
  if v_job is not null then perform cron.unschedule(v_job);end if;
  perform cron.schedule(
    'stockmaster-stripe-reconciliation','*/20 * * * *',
    format($job$select net.http_post(
      url:='https://mwpbinlxablzruvpjjjy.supabase.co/functions/v1/reconcile-stripe-payments',
      headers:=jsonb_build_object('Content-Type','application/json','X-StockMaster-Webhook',%L),
      body:='{}'::jsonb,
      timeout_milliseconds:=30000
    );$job$,v_secret)
  );
end $$;
