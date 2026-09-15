begin;

-- Bug trouvé en direct (15/09) suite à un retour testeur (« l'administrateur
-- n'a pas accès à effectuer une vente ») : le statut `subscriptions.status`
-- ('trialing'/'active') n'était JAMAIS mis à jour quand l'échéance
-- (expires_at/current_period_ends_at/trial_ends_at) passait — rien ne le
-- faisait. Conséquence concrète, vérifiée en direct sur 3 vraies
-- entreprises (dont une entreprise réelle avec 1 utilisateur, échéance
-- dépassée depuis plusieurs jours) : l'app continuait d'afficher
-- l'abonnement comme actif (tableau de bord, redirection à la connexion)
-- alors que has_active_subscription() — qui compare directement à
-- l'échéance, pas au statut — bloquait déjà en silence toute vente ou
-- création. Le propriétaire tombait alors sur « Vous n'avez pas
-- l'autorisation d'effectuer cette action » (voir la 2e partie de cette
-- migration) sans aucun indice que son essai/abonnement était simplement
-- terminé.
--
-- Le système savait déjà détecter cette échéance (l'email de rappel
-- « Votre période d'abonnement est terminée » existe depuis le 12/09) mais
-- ne mettait jamais à jour la ligne elle-même. Corrigé en ajoutant cette
-- mise à jour au même job planifié (toutes les 5 minutes, déjà en place
-- pour les emails), pour que la mise à jour et le rappel restent
-- cohérents dans la même exécution.
create or replace function private.expire_stale_subscriptions()
returns void language plpgsql security definer set search_path='' as $$
begin
  update public.subscriptions
  set status='expired'
  where status in ('trialing','active','past_due')
    and coalesce(expires_at,current_period_ends_at,trial_ends_at) <= now();
end $$;
revoke all on function private.expire_stale_subscriptions() from public,anon,authenticated;

create or replace function private.enqueue_billing_emails()
returns void language plpgsql security definer set search_path='' as $$
declare v_since timestamptz; r record; v_kind text; v_title text; v_body text; v_renewal boolean; v_owner uuid;
begin
  -- Serialize overlapping cron/manual runs; the unique ledger also protects retries.
  if not pg_try_advisory_xact_lock(609120001) then return; end if;
  perform private.expire_stale_subscriptions();
  select enabled_at into v_since from private.billing_email_settings where singleton and enabled;
  if v_since is null then return; end if;
  for r in
    select p.*,pl.name plan_name,s.starts_at,
      coalesce(s.expires_at,s.current_period_ends_at,s.trial_ends_at) period_end
    from public.payment_transactions p
    join public.subscriptions s on s.id=p.subscription_id and s.company_id=p.company_id
    join public.plans pl on pl.id=p.plan_id
    join public.companies c on c.id=p.company_id and c.is_active and c.plan_archived_at is null
    join auth.users u on u.id=p.client_id and (u.banned_until is null or u.banned_until<=now())
    where p.status='succeeded' and p.confirmed_at>=v_since
      and not exists(select 1 from private.billing_email_events e where e.event_key='receipt:'||p.id::text)
    order by p.confirmed_at limit 100
  loop
    select exists(select 1 from public.payment_transactions old
      where old.company_id=r.company_id and old.status='succeeded' and old.id<>r.id
        and (old.confirmed_at,old.id)<(r.confirmed_at,r.id)) into v_renewal;
    v_title := case when v_renewal then 'Renouvellement confirmé' else 'Reçu de paiement' end;
    v_body := format(E'Paiement confirmé : %s %s\nReçu : %s\nForfait : %s\nPériodicité : %s\nMoyen de paiement : %s\nRéférence : %s\nDate du paiement (UTC) : %s\nDébut de période (UTC) : %s\nFin de période (UTC) : %s\n\nConservez cet email comme reçu. Retrouvez votre abonnement dans votre espace propriétaire.',
      r.amount,r.currency,r.id,r.plan_name,
      case when r.billing_cycle='annual' then 'Annuelle' else 'Mensuelle' end,
      r.provider,coalesce(r.provider_reference,r.id::text),
      to_char(r.confirmed_at at time zone 'UTC','DD/MM/YYYY HH24:MI'),
      coalesce(to_char(r.starts_at at time zone 'UTC','DD/MM/YYYY HH24:MI'),'Non renseignée'),
      coalesce(to_char(r.period_end at time zone 'UTC','DD/MM/YYYY HH24:MI'),'Consultez votre espace propriétaire'));
    perform private.emit_billing_email('receipt:'||r.id,r.company_id,r.client_id,r.subscription_id,'receipt',null,v_title,v_body);
  end loop;
  for r in
    select s.*,coalesce(s.expires_at,s.current_period_ends_at,s.trial_ends_at) deadline
    from public.companies c
    cross join lateral (select sub.* from public.subscriptions sub where sub.company_id=c.id
      order by sub.created_at desc,sub.id desc limit 1) s
    where c.is_active and c.plan_archived_at is null
  loop
    v_kind := private.billing_reminder_kind(r.status::text,r.deadline,now());
    if v_kind is null then continue; end if;
    v_title := case v_kind when 'trial_ending' then 'Votre essai se termine bientôt'
      when 'expired' then 'Votre période d’abonnement est terminée'
      else 'Votre abonnement arrive à échéance' end;
    v_body := format(E'Échéance (UTC) : %s\n\nConsultez votre espace propriétaire, rubrique Abonnement, pour connaître vos options et renouveler si nécessaire. Ce rappel ne déclenche aucun prélèvement.',
      to_char(r.deadline at time zone 'UTC','DD/MM/YYYY HH24:MI'));
    -- Explicit owner prevents disclosure through legacy company-wide notification policies.
    select m.user_id into v_owner from public.memberships m
      join public.roles roles on roles.id=m.role_id and roles.company_id=m.company_id
      join auth.users u on u.id=m.user_id
      where m.company_id=r.company_id and m.is_active and roles.code='company_admin'
        and (u.banned_until is null or u.banned_until<=now())
      order by m.user_id limit 1;
    if v_owner is null then continue; end if;
    perform private.emit_billing_email('reminder:'||r.id||':'||extract(epoch from r.deadline)::text||':'||v_kind,
      r.company_id,v_owner,r.id,v_kind,r.deadline,v_title,v_body);
  end loop;
end $$;
revoke all on function private.enqueue_billing_emails() from public,anon,authenticated;

-- Rattrapage immédiat : ne pas attendre jusqu'à 5 minutes pour corriger les
-- lignes déjà périmées (dont une entreprise réelle, en retard de 10 jours).
select private.expire_stale_subscriptions();

commit;
