-- Correctif ponctuel (une fois) pour les clients qui possédaient déjà plusieurs
-- entreprises AVANT 202609251500 : celle-ci n'empêche le décalage que pour une
-- entreprise créée à partir de maintenant, elle ne corrige rien de rétroactif.
--
-- Règle : l'entreprise marquée is_primary dans client_businesses (la première
-- créée par ce propriétaire, voir create_business()) fait référence ; toutes
-- les autres entreprises du même client_id reprennent son forfait, son statut
-- et son échéance — uniquement leur ligne subscriptions la plus récente (pas
-- l'historique). payment_provider/payment_reference ne sont pas touchés :
-- chaque ligne garde sa propre référence, aucune contrainte à respecter ici
-- puisqu'on ne duplique aucune référence entre lignes.
do $$
declare
  v_client_id uuid;
  v_primary record;
begin
  for v_client_id in
    select cb.client_id from client_businesses cb group by cb.client_id having count(*) > 1
  loop
    select s.plan_id, s.status, s.trial_ends_at, s.current_period_ends_at, s.expires_at,
           s.grace_period_ends_at, s.billing_cycle, s.auto_renew
    into v_primary
    from client_businesses cb
    join lateral (
      select * from subscriptions where company_id = cb.company_id order by created_at desc limit 1
    ) s on true
    where cb.client_id = v_client_id and cb.is_primary;

    if not found then continue; end if;

    update subscriptions s set
      plan_id = v_primary.plan_id,
      status = v_primary.status,
      trial_ends_at = v_primary.trial_ends_at,
      current_period_ends_at = v_primary.current_period_ends_at,
      expires_at = v_primary.expires_at,
      grace_period_ends_at = v_primary.grace_period_ends_at,
      billing_cycle = coalesce(v_primary.billing_cycle, 'monthly'),
      auto_renew = v_primary.auto_renew,
      updated_at = now()
    where s.id in (
      select latest.id
      from client_businesses cb
      join lateral (
        select id from subscriptions where company_id = cb.company_id order by created_at desc limit 1
      ) latest on true
      where cb.client_id = v_client_id and not cb.is_primary
    );
  end loop;
end $$;
