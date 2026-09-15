begin;

-- Détection automatique de la dérive trouvée le 15/09 (sale_financials et
-- consœurs repassées à security_invoker=true en direct, sans trace dans
-- les migrations — signature d'un correctif Security Advisor accepté par
-- erreur, voir 202609150003). Ajoute une nouvelle catégorie d'alerte
-- critique à super_admin_platform_warnings() (déjà affichée à chaque
-- chargement du tableau de bord Super Admin) : si l'une des 4 vues
-- financières protégées repasse en security_invoker=true, ça remonte
-- immédiatement dans Avertissements au lieu d'attendre qu'un testeur
-- tombe sur l'erreur 42501 et le signale.
create or replace function public.super_admin_platform_warnings()
returns table(
  warning_key text,warning_type text,severity text,title text,detail text,
  company_ids uuid[],company_names text[],occurrence_count bigint,
  detected_at timestamptz,status text,note text
)
language sql stable security definer set search_path=public as $$
with latest_subscriptions as (
  select distinct on(company_id) company_id,status,trial_ends_at,expires_at,current_period_ends_at
  from public.subscriptions order by company_id,created_at desc
), candidates as (
  select 'company_name:'||md5(lower(trim(c.name))) warning_key,'duplicate_company_name' warning_type,
    'warning' severity,'Entreprises au nom identique' title,
    count(*)||' entreprises utilisent le nom « '||min(c.name)||' ». Vérifiez leurs coordonnées avant toute action.' detail,
    array_agg(c.id order by c.created_at) company_ids,array_agg(c.name order by c.created_at) company_names,
    count(*)::bigint occurrence_count,max(c.created_at) detected_at
  from public.companies c where c.is_active group by lower(trim(c.name)) having count(*)>1
  union all
  select 'company_phone:'||md5(regexp_replace(c.phone,'\D','','g')),'duplicate_company_phone','warning',
    'Téléphone partagé par plusieurs entreprises',count(*)||' entreprises utilisent le même numéro de téléphone.',
    array_agg(c.id order by c.created_at),array_agg(c.name order by c.created_at),count(*)::bigint,max(c.created_at)
  from public.companies c where c.is_active and length(regexp_replace(coalesce(c.phone,''),'\D','','g'))>=7
  group by regexp_replace(c.phone,'\D','','g') having count(*)>1
  union all
  select 'company_address:'||md5(lower(trim(c.address))),'duplicate_company_address','info',
    'Adresse partagée par plusieurs entreprises',count(*)||' entreprises utilisent la même adresse. Cette similarité peut être normale.',
    array_agg(c.id order by c.created_at),array_agg(c.name order by c.created_at),count(*)::bigint,max(c.created_at)
  from public.companies c where c.is_active and length(trim(coalesce(c.address,'')))>=8
  group by lower(trim(c.address)) having count(*)>1
  union all
  select 'multiple_trials:'||m.user_id::text,'multiple_trials_owner','critical',
    'Plusieurs essais pour un même propriétaire',count(*)||' entreprises en essai actif appartiennent au même propriétaire.',
    array_agg(m.company_id order by c.created_at),array_agg(c.name order by c.created_at),count(*)::bigint,max(c.created_at)
  from public.memberships m join public.roles r on r.id=m.role_id and r.code='company_admin'
  join public.companies c on c.id=m.company_id and c.is_active
  join latest_subscriptions s on s.company_id=m.company_id and s.status='trialing'
    and coalesce(s.trial_ends_at,s.expires_at,s.current_period_ends_at)>now()
  where m.is_active group by m.user_id having count(*)>1
  union all
  select 'error_spike:'||e.company_id::text||':'||current_date::text,'error_spike','critical',
    'Pic d’erreurs applicatives',count(*)||' erreurs ont été enregistrées en 24 heures pour '||coalesce(max(c.name),'une entreprise')||'.',
    array[e.company_id],array[coalesce(max(c.name),'Entreprise')],count(*)::bigint,max(e.created_at)
  from public.app_error_events e left join public.companies c on c.id=e.company_id
  where e.created_at>=now()-interval '24 hours' and e.severity in ('error','fatal') and e.resolved_at is null and e.company_id is not null
  group by e.company_id having count(*)>=5
  union all
  select 'email_delivery','email_delivery','critical','Emails transactionnels en attente',
    count(*)||' email(s) n’ont pas encore été envoyés. Vérifiez Resend et l’adresse d’expédition.',
    array[]::uuid[],array[]::text[],count(*)::bigint,max(o.created_at)
  from public.notification_email_outbox o where o.status in ('pending','failed')
  having count(*)>0
  union all
  select 'security_invoker:'||c.relname,'security_view_broken','critical',
    'Vue de sécurité compromise : '||c.relname,
    'security_invoker est repassé à true sur cette vue protégée : elle vérifie désormais les droits de qui la lit au lieu de ceux de son propriétaire, ce qui casse la protection prévue (les colonnes sensibles deviennent illisibles pour ceux qui devraient y avoir accès). Cause fréquente : un correctif accepté depuis Database > Security Advisor sur l''avertissement « Security Definer View » — ne pas l''accepter pour cette vue. Pour corriger : redéployer la migration qui la définit avec security_invoker=false.',
    array[]::uuid[],array[]::text[],1::bigint,now()
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='v'
    and c.relname in ('sale_financials','sale_item_financials','product_costs','product_variant_costs')
    and exists(select 1 from unnest(c.reloptions) opt where opt='security_invoker=true')
)
select c.warning_key,c.warning_type,c.severity,c.title,c.detail,c.company_ids,c.company_names,
  c.occurrence_count,c.detected_at,coalesce(r.status,'open'),r.note
from candidates c left join public.platform_warning_reviews r using(warning_key)
where public.is_super_admin()
order by case coalesce(r.status,'open') when 'open' then 0 when 'ignored' then 1 else 2 end,
  case c.severity when 'critical' then 0 when 'warning' then 1 else 2 end,c.detected_at desc
$$;
grant execute on function public.super_admin_platform_warnings() to authenticated;
revoke all on function public.super_admin_platform_warnings() from anon;

notify pgrst,'reload schema';
commit;
