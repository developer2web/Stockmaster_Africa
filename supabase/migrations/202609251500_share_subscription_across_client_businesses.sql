-- Retour testeur du 25/09 : un propriétaire qui crée une nouvelle entreprise
-- (ex. une deuxième boutique) alors qu'il a déjà un abonnement en cours sur une
-- autre de ses entreprises ne doit pas repartir sur un essai indépendant — la
-- nouvelle entreprise reprend le même forfait, le même statut et la même
-- échéance que sa dernière entreprise encore active. La capacité (combien
-- d'entreprises un forfait autorise) reste gérée ailleurs, sans changement :
-- apply_subscription_business_limit() (max_businesses du forfait).
--
-- create_business() insère déjà la ligne subscriptions avant client_businesses
-- n'intervient pas : c'est ce trigger BEFORE INSERT, fill_subscription_client(),
-- qui décide réellement du forfait d'une nouvelle ligne — une tentative
-- précédente de corriger create_business() elle-même (202609150042) n'avait
-- eu aucun effet réel pour cette même raison (voir 202609150047).
--
-- payment_provider/payment_reference restent vides sur la ligne copiée :
-- subscriptions_payment_reference_unique n'autorise qu'une seule ligne par
-- référence de paiement, déjà portée par l'entreprise d'origine — copier la
-- référence ferait échouer l'insertion (contrainte unique violée) pour
-- exactement le cas qu'on corrige ici.
create or replace function public.fill_subscription_client()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_trial integer; v_grace integer; v_trial_enabled boolean; v_requested_plan uuid;
  v_existing record;
begin
  if new.client_id is null then
    select coalesce(
      (select cb.client_id from client_businesses cb where cb.company_id=new.company_id order by cb.is_primary desc limit 1),
      (select c.created_by from companies c where c.id=new.company_id)
    ) into new.client_id;
  end if;
  new.starts_at:=coalesce(new.starts_at,new.created_at,now());

  if tg_op='INSERT' and new.client_id is not null then
    select s.plan_id,s.status,s.trial_ends_at,s.current_period_ends_at,s.expires_at,
           s.grace_period_ends_at,s.billing_cycle,s.auto_renew
    into v_existing
    from subscriptions s
    where s.client_id=new.client_id and s.company_id<>new.company_id
      and s.expires_at is not null and s.expires_at>now()
    order by s.created_at desc limit 1;
    if found then
      new.plan_id:=v_existing.plan_id;
      new.status:=v_existing.status;
      new.trial_ends_at:=v_existing.trial_ends_at;
      new.current_period_ends_at:=v_existing.current_period_ends_at;
      new.expires_at:=v_existing.expires_at;
      new.grace_period_ends_at:=v_existing.grace_period_ends_at;
      new.billing_cycle:=coalesce(v_existing.billing_cycle,'monthly');
      new.auto_renew:=v_existing.auto_renew;
      return new;
    end if;
  end if;

  select trial_days,grace_period_days,trial_enabled into v_trial,v_grace,v_trial_enabled
  from billing_settings where id;
  if tg_op='INSERT' and new.status='trialing' and coalesce(new.payment_provider,'')='' then
    select p.id into v_requested_plan
    from auth.users u
    join plans p on p.code=case
      when u.raw_user_meta_data->>'selected_plan' in ('basic','pro','premium')
        then u.raw_user_meta_data->>'selected_plan'
      when u.raw_user_meta_data->>'selected_plan'='business' then 'premium'
      else 'pro'
    end and p.is_active
    where u.id=coalesce(new.client_id,new.created_by,auth.uid());
    new.plan_id:=coalesce(v_requested_plan,new.plan_id);
    new.trial_ends_at:=new.starts_at+make_interval(days=>v_trial);
    new.current_period_ends_at:=new.trial_ends_at;
    new.expires_at:=new.trial_ends_at;
    if not v_trial_enabled then new.status:='expired';end if;
  else
    new.expires_at:=coalesce(new.expires_at,new.current_period_ends_at,new.trial_ends_at);
  end if;
  new.grace_period_ends_at:=coalesce(new.grace_period_ends_at,new.expires_at+make_interval(days=>v_grace));
  new.billing_cycle:=coalesce(new.billing_cycle,'monthly');
  return new;
end $$;
