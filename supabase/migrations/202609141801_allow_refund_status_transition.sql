begin;

-- protect_payment_operation() (202609100002) protège à juste titre un
-- paiement déjà « terminé » (succeeded/failed/cancelled/expired) contre
-- toute réinitialisation de son statut — mais il a été écrit avant que
-- 'refunded' n'existe, et bloquait donc aussi la transition légitime
-- succeeded -> refunded ajoutée par 202609141800. On l'autorise
-- précisément, sans rien assouplir d'autre : 'refunded' rejoint la liste
-- des statuts protégés (un paiement remboursé reste, lui aussi, figé),
-- et seule la transition exacte succeeded -> refunded est laissée passer.
create or replace function public.protect_payment_operation()
returns trigger language plpgsql set search_path=public as $$
begin
  if row(new.client_id,new.operation_id,new.plan_id,new.provider,new.billing_cycle,new.amount,new.currency,
      new.base_amount,new.discount_amount,new.bonus_days,new.promotion_id,new.retained_company_id,new.phone_number,new.request_details)
    is distinct from row(old.client_id,old.operation_id,old.plan_id,old.provider,old.billing_cycle,old.amount,old.currency,
      old.base_amount,old.discount_amount,old.bonus_days,old.promotion_id,old.retained_company_id,old.phone_number,old.request_details)
    or (new.company_id is not null and new.company_id is distinct from old.company_id)
    or (old.provider_reference is not null and new.provider_reference is distinct from old.provider_reference) then
    raise exception 'Les paramètres d’une opération de paiement sont immuables.' using errcode='23514';
  end if;
  if old.status in ('succeeded','failed','cancelled','expired','refunded')
    and not (old.status='succeeded' and new.status='refunded')
    and (row(new.status,new.confirmed_at) is distinct from row(old.status,old.confirmed_at)
     or (new.subscription_id is distinct from old.subscription_id
       and not (new.subscription_id is null and pg_trigger_depth()>1))) then
    raise exception 'Un paiement terminé ne peut pas être réinitialisé.' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function public.protect_payment_operation() from public,anon,authenticated;

notify pgrst,'reload schema';
commit;
