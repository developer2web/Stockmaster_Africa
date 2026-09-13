begin;
alter table public.payment_transactions add column if not exists request_details jsonb;
drop function if exists public.submit_manual_subscription_payment(uuid,uuid,text,text,text,text,uuid,uuid);
create or replace function public.submit_manual_subscription_payment(
  p_company_id uuid,p_plan_id uuid,p_billing_cycle text,p_reference text,
  p_proof_path text default null,p_promo_code text default null,
  p_operation_id uuid default gen_random_uuid(),p_retained_company_id uuid default null,
  p_expected_amount numeric default null,p_expected_currency text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_quote record; v_existing public.payment_transactions%rowtype;
  v_id uuid; v_limit integer; v_active_count integer; v_matches integer;
  v_reference text:=upper(regexp_replace(trim(coalesce(p_reference,'')),'\s+','','g'));
  v_request jsonb;
begin
  if not exists(select 1 from auth.users u where u.id=auth.uid()
    and (u.banned_until is null or u.banned_until<=now())
    and coalesce(u.raw_app_meta_data->>'must_change_password','false')<>'true'
    and ((auth.jwt()->>'aal')='aal2' or not exists(select 1 from auth.mfa_factors f where f.user_id=u.id and f.status='verified')))
    then raise exception 'Vérifiez votre connexion et la sécurité de votre session.' using errcode='42501'; end if;
  if v_reference !~ '^[A-Z0-9_/-]{4,100}$' then raise exception 'Référence Orange Money invalide';end if;
  if p_operation_id is null or p_billing_cycle not in ('monthly','annual') then raise exception 'Demande de paiement invalide';end if;
  if not exists(select 1 from public.client_businesses where client_id=auth.uid() and company_id=p_company_id) then
    raise exception 'Seul le propriétaire peut payer un forfait' using errcode='42501';
  end if;
  if p_retained_company_id is not null and not exists(select 1 from public.client_businesses where client_id=auth.uid() and company_id=p_retained_company_id) then
    raise exception 'Entreprise à conserver invalide';
  end if;
  v_request:=jsonb_build_object('promoCode',nullif(upper(trim(coalesce(p_promo_code,''))),''));
  perform public.lock_operation(p_operation_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('orange_money_manual:'||v_reference,0));
  select * into v_existing from public.payment_transactions where client_id=auth.uid() and operation_id=p_operation_id for update;
  if v_existing.id is null then
    select count(*) into v_matches from public.payment_transactions
    where provider='orange_money_manual' and upper(regexp_replace(trim(provider_reference),'\s+','','g'))=v_reference;
    if v_matches>1 then raise exception 'Référence déjà enregistrée plusieurs fois. Contactez le support avant un autre transfert.';end if;
    select * into v_existing from public.payment_transactions
    where provider='orange_money_manual' and upper(regexp_replace(trim(provider_reference),'\s+','','g'))=v_reference for update;
  end if;
  if v_existing.id is not null then
    if v_existing.client_id<>auth.uid() then raise exception 'Cette référence ne peut pas être utilisée. Contactez le support.' using errcode='42501';end if;
    if v_existing.provider<>'orange_money_manual' or v_existing.company_id is distinct from p_company_id
      or v_existing.plan_id is distinct from p_plan_id or v_existing.billing_cycle is distinct from p_billing_cycle
      or v_existing.retained_company_id is distinct from p_retained_company_id
      or upper(regexp_replace(trim(v_existing.provider_reference),'\s+','','g')) is distinct from v_reference
      or (v_existing.request_details is not null and v_existing.request_details->>'promoCode' is distinct from v_request->>'promoCode')
      or (p_expected_amount is not null and v_existing.amount<>p_expected_amount)
      or (p_expected_currency is not null and trim(v_existing.currency)<>upper(trim(p_expected_currency))) then
      raise exception 'Cette transaction est déjà enregistrée avec d’autres paramètres. Consultez son historique avant un autre transfert.';
    end if;
    -- Preserve the original proof and final status, including retries after a lost response.
    return v_existing.id;
  end if;
  if not exists(select 1 from public.billing_settings where id
    and regexp_replace(coalesce(orange_money_number,''),'[\s-]','','g') ~ '^\+?[0-9]{8,15}$'
    and length(trim(coalesce(orange_money_account_name,'')))>0) then
    raise exception 'Compte Orange Money non configuré. Contactez le support avant tout transfert.';
  end if;
  if p_proof_path is not null and (split_part(p_proof_path,'/',1)<>auth.uid()::text
    or length(p_proof_path)>1024 or not exists(select 1 from storage.objects
      where bucket_id='payment-proofs' and name=p_proof_path
        and metadata->>'mimetype' in ('image/jpeg','image/png','image/webp'))) then
    raise exception 'Justificatif introuvable ou non autorisé';
  end if;
  select greatest(1,max_businesses) into v_limit from public.plans where id=p_plan_id and is_active;
  if v_limit is null then raise exception 'Forfait indisponible';end if;
  select count(*) into v_active_count from public.client_businesses cb join public.companies c on c.id=cb.company_id
  where cb.client_id=auth.uid() and c.plan_archived_at is null;
  if v_active_count>v_limit and p_retained_company_id is null then raise exception 'Choisissez l’entreprise à conserver avant de continuer';end if;
  select * into v_quote from public.subscription_quote(p_company_id,p_plan_id,p_billing_cycle,p_promo_code);
  if (p_expected_amount is not null and v_quote.final_amount<>p_expected_amount)
    or (p_expected_currency is not null and trim(v_quote.currency)<>upper(trim(p_expected_currency))) then
    raise exception 'Le montant du forfait a changé. Si vous avez déjà transféré l’argent, contactez le support sans refaire de transfert.';
  end if;
  insert into public.payment_transactions(client_id,company_id,plan_id,provider,provider_reference,operation_id,billing_cycle,
    base_amount,discount_amount,amount,currency,status,proof_path,submitted_at,promotion_id,bonus_days,retained_company_id,request_details)
  values(auth.uid(),p_company_id,p_plan_id,'orange_money_manual',v_reference,p_operation_id,p_billing_cycle,
    v_quote.base_amount,v_quote.discount_amount,v_quote.final_amount,v_quote.currency,'processing',p_proof_path,now(),
    v_quote.promotion_id,v_quote.bonus_days,p_retained_company_id,v_request) returning id into v_id;
  insert into public.payment_status_log(payment_transaction_id,old_status,new_status,source,payload)
  values(v_id,null,'processing','manual-submission',jsonb_build_object('proof',p_proof_path is not null,'retained_company_id',p_retained_company_id));
  return v_id;
end $$;
revoke all on function public.submit_manual_subscription_payment(uuid,uuid,text,text,text,text,uuid,uuid,numeric,text) from public,anon;
grant execute on function public.submit_manual_subscription_payment(uuid,uuid,text,text,text,text,uuid,uuid,numeric,text) to authenticated;
notify pgrst,'reload schema';
commit;
