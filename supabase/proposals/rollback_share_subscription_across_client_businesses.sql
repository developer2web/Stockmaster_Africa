-- Rollback de 202609251500_share_subscription_across_client_businesses.sql :
-- restaure fill_subscription_client() exactement comme défini dans
-- 202609150047_trial_default_plan_is_pro.sql (avant l'ajout de l'héritage
-- d'abonnement entre entreprises d'un même propriétaire).
create or replace function public.fill_subscription_client()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_trial integer;v_grace integer;v_trial_enabled boolean;v_requested_plan uuid;
begin
  if new.client_id is null then
    select coalesce(
      (select cb.client_id from client_businesses cb where cb.company_id=new.company_id order by cb.is_primary desc limit 1),
      (select c.created_by from companies c where c.id=new.company_id)
    ) into new.client_id;
  end if;
  new.starts_at:=coalesce(new.starts_at,new.created_at,now());
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
