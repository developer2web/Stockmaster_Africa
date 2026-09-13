-- Lecture seule, à exécuter dans le SQL Editor du projet Supabase concerné.
-- Aucun envoi, aucune réinitialisation de file, aucune clé affichée.
-- Si une relation est absente, appliquer d'abord les migrations correspondantes.
select
  to_regclass('public.notification_email_outbox') is not null as file_email_presente,
  to_regclass('cron.job') is not null as cron_present,
  exists(select 1 from pg_extension where extname='pg_net') as pg_net_present,
  exists(select 1 from pg_trigger where tgname='enqueue_notification_email' and not tgisinternal and tgenabled <> 'D') as creation_email_active,
  exists(select 1 from pg_trigger where tgname='dispatch_notification_email_job' and not tgisinternal and tgenabled <> 'D') as declenchement_email_actif;

select status, count(*) as total,
  count(*) filter(where attempts >= 8 and status='failed') as tentatives_epuisees,
  count(*) filter(where status='processing' and updated_at < now()-interval '10 minutes') as traitements_a_verifier,
  min(next_attempt_at) as prochaine_tentative,
  max(created_at) as derniere_creation
from public.notification_email_outbox group by status order by status;

select status, attempts, last_error, created_at, updated_at, next_attempt_at
from public.notification_email_outbox
where status <> 'sent'
order by updated_at desc limit 20;

-- Ne pas sélectionner command : cette colonne contient le secret du webhook.
select jobname, schedule, active from cron.job
where jobname='stockmaster-notification-email-retry';

select d.status, d.start_time, d.end_time
from cron.job_run_details d join cron.job j on j.jobid=d.jobid
where j.jobname='stockmaster-notification-email-retry'
order by d.start_time desc limit 10;
-- Un cron réussi prouve la soumission HTTP, pas l'acceptation par la fonction
-- ni la livraison. Vérifier ensuite les invocations/logs de notification-email.
