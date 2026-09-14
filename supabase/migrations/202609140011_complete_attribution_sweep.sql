begin;

-- Liste complète (vérifiée directement dans information_schema, pas devinée
-- depuis l'historique des migrations) de toutes les colonnes nullables
-- référençant profiles(id) à travers le schéma. Les colonnes NOT NULL
-- (sale_returns, customer_orders, support_tickets, expense_requests.requested_by,
-- currency_change_audit, payment_transactions.client_id, promotion_redemptions,
-- company_status_events, customer_credit_notes, customer_debt_schedules,
-- cash_closures.closed_by, cash_openings.opened_by) ne peuvent structurellement
-- pas être vidées : si l'une d'elles retient encore ce compte, la suppression
-- physique échoue proprement (message clair) plutôt que de forcer une valeur
-- invalide — l'anonymisation reste alors la bonne option.
create or replace function public.super_admin_delete_account_permanently(p_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  v_has_payment boolean;
  v_has_active_membership boolean;
  v_blocks_active_billing boolean;
  v_detail text;
begin
  if not public.is_super_admin() then raise exception 'Accès Super Admin requis' using errcode='42501'; end if;
  perform public.assert_session_security(false);
  if not exists(select 1 from public.profiles where id=p_user_id) then raise exception 'Compte introuvable'; end if;

  select exists(
    select 1 from public.payment_transactions where client_id=p_user_id and status='succeeded'
  ) into v_has_payment;
  if v_has_payment then
    raise exception 'Ce compte a au moins un paiement réussi : suppression physique refusée. Utilisez l''anonymisation (Suppressions) à la place.';
  end if;

  select exists(
    select 1 from public.memberships where user_id=p_user_id and is_active
  ) into v_has_active_membership;
  if v_has_active_membership then
    raise exception 'Ce compte a encore un accès actif dans une entreprise : désactivez-le d''abord (Utilisateurs), puis réessayez.';
  end if;

  select exists(
    select 1 from public.client_businesses cb
    where cb.client_id=p_user_id
      and exists(
        select 1 from public.memberships m
        where m.company_id=cb.company_id and m.user_id<>p_user_id and m.is_active
      )
  ) into v_blocks_active_billing;
  if v_blocks_active_billing then
    raise exception 'Ce compte facture une entreprise qui a encore d''autres membres actifs : suppression physique refusée pour ne pas casser leur facturation. Utilisez l''anonymisation (Suppressions) à la place.';
  end if;

  update public.account_deletion_requests set processed_by=null where processed_by=p_user_id;
  update public.admin_access_requests set reviewed_by=null where reviewed_by=p_user_id;
  update public.app_error_events set resolved_by=null where resolved_by=p_user_id;
  update public.audit_logs set actor_id=null where actor_id=p_user_id;
  update public.audit_logs set created_by=null where created_by=p_user_id;
  update public.billing_settings set updated_by=null where updated_by=p_user_id;
  update public.cash_transactions set created_by=null where created_by=p_user_id;
  update public.categories set created_by=null where created_by=p_user_id;
  update public.client_businesses set created_by=null where created_by=p_user_id;
  update public.companies set created_by=null where created_by=p_user_id;
  update public.daily_reports set created_by=null where created_by=p_user_id;
  update public.expense_requests set reviewed_by=null where reviewed_by=p_user_id;
  update public.expenses set created_by=null where created_by=p_user_id;
  update public.inventories set created_by=null where created_by=p_user_id;
  update public.inventories set validated_by=null where validated_by=p_user_id;
  update public.inventory_items set created_by=null where created_by=p_user_id;
  update public.membership_stores set created_by=null where created_by=p_user_id;
  update public.memberships set created_by=null where created_by=p_user_id;
  update public.monthly_reports set created_by=null where created_by=p_user_id;
  update public.notifications set created_by=null where created_by=p_user_id;
  update public.notifications set user_id=null where user_id=p_user_id;
  update public.payments set created_by=null where created_by=p_user_id;
  update public.platform_warning_reviews set reviewed_by=null where reviewed_by=p_user_id;
  update public.product_variants set created_by=null where created_by=p_user_id;
  update public.products set created_by=null where created_by=p_user_id;
  update public.promotions set created_by=null where created_by=p_user_id;
  update public.purchase_items set created_by=null where created_by=p_user_id;
  update public.purchases set created_by=null where created_by=p_user_id;
  update public.purchases set cancelled_by=null where cancelled_by=p_user_id;
  update public.role_permissions set created_by=null where created_by=p_user_id;
  update public.roles set created_by=null where created_by=p_user_id;
  update public.sale_items set created_by=null where created_by=p_user_id;
  update public.sales set created_by=null where created_by=p_user_id;
  update public.stock_levels set created_by=null where created_by=p_user_id;
  update public.stock_movements set created_by=null where created_by=p_user_id;
  update public.stores set created_by=null where created_by=p_user_id;
  update public.subscriptions set created_by=null where created_by=p_user_id;
  update public.subscriptions set client_id=null where client_id=p_user_id;
  update public.supplier_payments set created_by=null where created_by=p_user_id;
  update public.suppliers set created_by=null where created_by=p_user_id;
  update public.support_tickets set assigned_to=null where assigned_to=p_user_id;
  update public.transfer_items set created_by=null where created_by=p_user_id;
  update public.transfers set created_by=null where created_by=p_user_id;
  update public.warehouses set created_by=null where created_by=p_user_id;

  begin
    delete from auth.users where id=p_user_id;
  exception when foreign_key_violation then
    get stacked diagnostics v_detail = pg_exception_detail;
    raise exception 'Suppression physique impossible (donnée non couverte par le nettoyage automatique) : %. Utilisez l''anonymisation (Suppressions) à la place.', coalesce(v_detail,'détail indisponible');
  end;
end $$;
grant execute on function public.super_admin_delete_account_permanently(uuid) to authenticated;
revoke all on function public.super_admin_delete_account_permanently(uuid) from anon;

notify pgrst,'reload schema';
commit;
