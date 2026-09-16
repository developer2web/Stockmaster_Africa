begin;

-- Le diagnostic "Vérifier les accès" côté app mobile (owner/employé) est
-- retiré (16/09, demande explicite) — remplacé côté Super Admin en
-- étendant super_admin_server_health(), déjà affiché dans Paramètres >
-- Emails / API, plutôt que de construire un outil séparé. Cette fonction
-- vérifie qu'une signature exacte existe encore côté serveur (via
-- to_regprocedure) : c'est exactement ce qui aurait détecté le bug
-- PGRST202 trouvé plus tôt si get_sales_history_safe y avait déjà
-- figuré — cette fonction n'y était pas du tout, seule
-- get_filtered_sales_history l'était (fonction sœur, jamais touchée par
-- le bug). Ajoutées ici : get_sales_history_safe (signature vérifiée en
-- direct : p_company_id uuid, p_store_id uuid, p_cursor_created_at
-- timestamptz, p_cursor_id uuid, p_limit integer) et get_sale_detail_safe
-- (p_sale_id uuid), l'autre fonction que le diagnostic mobile retiré
-- vérifiait.
create or replace function public.super_admin_server_health()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare result jsonb;
begin
 -- Reuse the deployed Super Admin + MFA + account-state guard, without changing settings.
 perform public.super_admin_billing_email_settings();
 select jsonb_build_object(
  'checkedAt',now(),
  'readOnlyEnforced',exists(select 1 from pg_trigger where tgrelid='public.companies'::regclass and tgname='guard_expired_business_write' and tgenabled='O'),
  'functions', (select jsonb_agg(jsonb_build_object('name',name,'available',to_regprocedure(signature) is not null)) from (values
    ('Historique des ventes','public.get_filtered_sales_history(uuid,uuid,integer,integer,text,timestamp with time zone,timestamp with time zone,text,text)'),
    ('Historique des ventes (accès rapide)','public.get_sales_history_safe(uuid,uuid,timestamp with time zone,uuid,integer)'),
    ('Détail d''une vente','public.get_sale_detail_safe(uuid)'),
    ('Déclaration Orange Money','public.submit_manual_subscription_payment(uuid,uuid,text,text,text,text,uuid,uuid,numeric,text)'),
    ('Sécurité de session','public.assert_session_security(boolean)'),
    ('Verrouillage du paiement','public.claim_payment_provider_request(uuid)'),
    ('Notifications lues','public.mark_notifications_read(uuid)')
   ) required(name,signature)),
  'jobs',(select jsonb_agg(jsonb_build_object('name',expected.name,'active',coalesce(j.active,false),
    'lastStatus',(select d.status from cron.job_run_details d where d.jobid=j.jobid order by d.start_time desc limit 1)))
    from (values ('stockmaster-billing-emails'),('stockmaster-notification-email-retry'),('stockmaster-notification-retention')) expected(name)
    left join cron.job j on j.jobname=expected.name)
 ) into result;
 return result;
end $function$;

commit;
