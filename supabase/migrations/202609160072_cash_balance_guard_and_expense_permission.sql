begin;

-- Audit externe (PDF, 16/09) — SM-01 (BLOQUANT) et SM-02 (BLOQUANT), les deux
-- corrigés ensemble car ils touchent la même fonction.
--
-- SM-01 : la caisse pouvait passer sous zéro sans aucun avertissement via
-- « Effectuer une dépense » (record_cash_transaction, écran Caisse), alors
-- que deux autres écrans (approvisionnement payé maintenant, encaissement
-- client) affichent déjà un avertissement CÔTÉ CLIENT avant d'aller plus
-- loin. En creusant : aucun des trois n'a en réalité de vérification côté
-- SERVEUR — le client peut toujours être contourné par un appel direct à
-- l'API. Plutôt que de dupliquer le contrôle dans chaque fonction
-- (record_expense, record_cash_transaction, record_purchase, et tout futur
-- écran qui touche la caisse), il est posé une seule fois, au niveau le
-- plus bas commun à tous : un trigger sur cash_transactions elle-même,
-- puisque toute sortie de caisse — directe (approvisionnement payé
-- maintenant) ou indirecte via la dépense liée automatiquement par
-- sync_expense_to_cash (record_expense, et la branche « withdrawal » de
-- record_cash_transaction) — finit par y insérer une ligne. C'est
-- exactement ce que l'audit recommandait : « remonter la règle au niveau
-- du service de caisse ».
--
-- SM-02 : record_cash_transaction acceptait toute écriture dès que
-- l'utilisateur avait cash_transactions.write OU expenses.write (permis à
-- tous les employés par défaut) — alors qu'une sortie de type "withdrawal"
-- devient une vraie dépense (elle est insérée dans expenses). Décocher
-- « Gérer les dépenses » (expenses.write) pour le rôle Employé n'avait donc
-- aucun effet sur ce chemin précis : cash_transactions.write suffisait à
-- lui seul. Corrigé : une sortie de caisse exige maintenant les deux
-- permissions (ou company_admin), un dépôt ne demande toujours que
-- cash_transactions.write (ce n'est pas une dépense).

create or replace function public.guard_cash_balance_not_negative()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_base numeric := 0;
  v_since timestamptz;
  v_balance_excluding numeric;
begin
  if new.transaction_type <> 'withdrawal' or new.store_id is null then
    return new;
  end if;
  -- Sérialise les écritures concurrentes sur la même boutique : sans ça,
  -- deux sorties simultanées pourraient toutes les deux lire le solde
  -- d'avant l'autre et passer la vérification en même temps.
  perform pg_advisory_xact_lock(hashtextextended(new.store_id::text, 1));

  select co.counted_amount, co.created_at into v_base, v_since
    from public.cash_openings co where co.store_id = new.store_id
    order by co.created_at desc limit 1;
  v_base := coalesce(v_base, 0);

  -- Exclut la ligne elle-même (utile pour une UPDATE, ex. montant de dépense
  -- corrigé — sans effet sur un INSERT, où new.id ne correspond encore à
  -- aucune ligne existante) pour ne pas la compter deux fois.
  select v_base + coalesce(sum(case when ct.transaction_type = 'deposit' then ct.amount else -ct.amount end), 0)
    into v_balance_excluding
    from public.cash_transactions ct
    where ct.store_id = new.store_id
      and (v_since is null or ct.created_at > v_since)
      and ct.id is distinct from new.id;

  if v_balance_excluding - new.amount < 0 then
    raise exception 'Cette opération ferait passer la caisse en négatif (solde actuel : % GNF, montant demandé : % GNF).', v_balance_excluding, new.amount;
  end if;
  return new;
end
$function$;

drop trigger if exists guard_cash_balance_not_negative on public.cash_transactions;
create trigger guard_cash_balance_not_negative
  before insert or update on public.cash_transactions
  for each row execute function public.guard_cash_balance_not_negative();

create or replace function public.record_cash_transaction(p_store_id uuid, p_transaction_type cash_transaction_type, p_designation text, p_amount numeric, p_operation_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_company uuid;v_id uuid;
begin
  if p_store_id is null then
    raise exception 'Sélectionnez une boutique pour cette opération de caisse';
  end if;
  if length(trim(p_designation))<2 then raise exception 'Désignation requise'; end if;
  if p_amount<=0 then raise exception 'Le montant doit être positif'; end if;
  if p_operation_id is null then raise exception 'Clé d''idempotence requise'; end if;

  select m.company_id into v_company
  from memberships m
  join roles r on r.id=m.role_id
  join companies c on c.id=m.company_id
  join stores selected_store
    on selected_store.id=p_store_id
   and selected_store.company_id=m.company_id
   and selected_store.is_active
  where m.user_id=auth.uid() and m.is_active and c.is_active
    and (
      r.code='company_admin'
      or (
        -- Un dépôt (ajout de fonds) n'est pas une dépense : cash_transactions.write suffit.
        p_transaction_type='deposit' and public.has_permission(m.company_id,'cash_transactions.write')
      )
      or (
        -- Une sortie devient une vraie dépense (voir sync_expense_to_cash) :
        -- les deux permissions sont exigées, pas l'une ou l'autre.
        p_transaction_type='withdrawal'
        and public.has_permission(m.company_id,'cash_transactions.write')
        and public.has_permission(m.company_id,'expenses.write')
      )
    )
  limit 1;

  if v_company is null or not public.has_active_subscription(v_company) then
    raise exception 'Accès refusé';
  end if;
  if not exists(
    select 1 from stores
    where id=p_store_id and company_id=v_company and is_active
  ) or not public.can_access_store(v_company,p_store_id) then
    raise exception 'Boutique invalide ou non autorisée';
  end if;

  perform public.lock_operation(p_operation_id);

  if p_transaction_type='withdrawal' then
    select id into v_id from expenses
    where company_id=v_company and operation_id=p_operation_id;
    if v_id is not null then return v_id; end if;

    insert into expenses(
      company_id,store_id,label,amount,expense_date,operation_id,created_by
    ) values(
      v_company,p_store_id,trim(p_designation),p_amount,current_date,
      p_operation_id,auth.uid()
    ) returning id into v_id;
  else
    select id into v_id from cash_transactions
    where company_id=v_company and operation_id=p_operation_id;
    if v_id is not null then return v_id; end if;

    insert into cash_transactions(
      company_id,store_id,transaction_type,designation,amount,source,
      operation_id,created_by
    ) values(
      v_company,p_store_id,'deposit',trim(p_designation),p_amount,'manual',
      p_operation_id,auth.uid()
    ) returning id into v_id;
  end if;
  return v_id;
end
$function$;

commit;
