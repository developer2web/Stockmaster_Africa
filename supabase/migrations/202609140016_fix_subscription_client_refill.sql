begin;

-- fill_subscription_client() (trigger existant BEFORE INSERT/UPDATE sur
-- subscriptions) repeuple automatiquement client_id dès qu'il est vidé, en
-- retombant sur client_businesses puis companies.created_by. Comme
-- client_businesses.client_id n'est retiré que par la cascade FINALE de
-- auth.users (pas encore arrivée pendant ce trigger BEFORE DELETE), essayer
-- de vider subscriptions.client_id le faisait se re-remplir immédiatement
-- avec la même valeur — d'où le blocage malgré le nettoyage. On supprime
-- maintenant la ligne client_businesses (pas seulement son attribution)
-- avant de toucher subscriptions, pour que ce recours ne retrouve plus rien.
create or replace function public.protect_and_prepare_user_deletion()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_has_payment boolean;
  v_has_active_membership boolean;
  v_blocks_active_billing boolean;
begin
  select exists(
    select 1 from public.payment_transactions where client_id=old.id and status='succeeded'
  ) into v_has_payment;
  if v_has_payment then
    raise exception 'Ce compte a au moins un paiement réussi : suppression physique refusée. Utilisez l''anonymisation (Suppressions) à la place.';
  end if;

  select exists(
    select 1 from public.memberships where user_id=old.id and is_active
  ) into v_has_active_membership;
  if v_has_active_membership then
    raise exception 'Ce compte a encore un accès actif dans une entreprise : désactivez-le d''abord, puis réessayez.';
  end if;

  select exists(
    select 1 from public.client_businesses cb
    where cb.client_id=old.id
      and exists(
        select 1 from public.memberships m
        where m.company_id=cb.company_id and m.user_id<>old.id and m.is_active
      )
  ) into v_blocks_active_billing;
  if v_blocks_active_billing then
    raise exception 'Ce compte facture une entreprise qui a encore d''autres membres actifs : suppression physique refusée pour ne pas casser leur facturation. Utilisez l''anonymisation (Suppressions) à la place.';
  end if;

  update public.account_deletion_requests set processed_by=null where processed_by=old.id;
  update public.admin_access_requests set reviewed_by=null where reviewed_by=old.id;
  update public.app_error_events set resolved_by=null where resolved_by=old.id;
  update public.audit_logs set actor_id=null where actor_id=old.id;
  update public.audit_logs set created_by=null where created_by=old.id;
  update public.billing_settings set updated_by=null where updated_by=old.id;
  update public.cash_transactions set created_by=null where created_by=old.id;
  update public.categories set created_by=null where created_by=old.id;
  update public.companies set created_by=null where created_by=old.id;
  -- Supprimée (pas seulement son attribution) : évite que fill_subscription_client()
  -- ne la retrouve et re-remplisse subscriptions.client_id juste en dessous.
  delete from public.client_businesses where client_id=old.id;
  update public.client_businesses set created_by=null where created_by=old.id;
  update public.daily_reports set created_by=null where created_by=old.id;
  update public.expense_requests set reviewed_by=null where reviewed_by=old.id;
  update public.expenses set created_by=null where created_by=old.id;
  update public.inventories set created_by=null where created_by=old.id;
  update public.inventories set validated_by=null where validated_by=old.id;
  update public.inventory_items set created_by=null where created_by=old.id;
  update public.membership_stores set created_by=null where created_by=old.id;
  update public.memberships set created_by=null where created_by=old.id;
  update public.monthly_reports set created_by=null where created_by=old.id;
  update public.notifications set created_by=null where created_by=old.id;
  update public.notifications set user_id=null where user_id=old.id;
  update public.payments set created_by=null where created_by=old.id;
  update public.platform_warning_reviews set reviewed_by=null where reviewed_by=old.id;
  update public.product_variants set created_by=null where created_by=old.id;
  update public.products set created_by=null where created_by=old.id;
  update public.promotions set created_by=null where created_by=old.id;
  update public.purchase_items set created_by=null where created_by=old.id;
  update public.purchases set created_by=null where created_by=old.id;
  update public.purchases set cancelled_by=null where cancelled_by=old.id;
  update public.role_permissions set created_by=null where created_by=old.id;
  update public.roles set created_by=null where created_by=old.id;
  update public.sale_items set created_by=null where created_by=old.id;
  update public.sales set created_by=null where created_by=old.id;
  update public.stock_levels set created_by=null where created_by=old.id;
  update public.stock_movements set created_by=null where created_by=old.id;
  update public.stores set created_by=null where created_by=old.id;
  update public.subscriptions set created_by=null where created_by=old.id;
  update public.subscriptions set client_id=null where client_id=old.id;
  update public.supplier_payments set created_by=null where created_by=old.id;
  update public.suppliers set created_by=null where created_by=old.id;
  update public.support_tickets set assigned_to=null where assigned_to=old.id;
  update public.transfer_items set created_by=null where created_by=old.id;
  update public.transfers set created_by=null where created_by=old.id;
  update public.warehouses set created_by=null where created_by=old.id;

  return old;
end $$;

notify pgrst,'reload schema';
commit;
