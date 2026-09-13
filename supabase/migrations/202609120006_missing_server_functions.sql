begin;
alter table public.payment_transactions add column if not exists provider_request_started_at timestamptz;
create or replace function public.session_security_satisfied(p_allow_temporary_password boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from auth.users u where u.id=(select auth.uid()) and (u.banned_until is null or u.banned_until <= now())
      and (p_allow_temporary_password or coalesce(u.raw_app_meta_data->>'must_change_password','false') <> 'true')
      and (
        (select auth.jwt()->>'aal')='aal2'
        or not exists(select 1 from auth.mfa_factors f where f.user_id=u.id and f.status='verified')
      )
  );
$$;
revoke all on function public.session_security_satisfied(boolean) from public,anon;
grant execute on function public.session_security_satisfied(boolean) to authenticated;

create or replace function public.assert_session_security(p_allow_temporary_password boolean default false)
returns void language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception using errcode='42501',message='Connexion requise.'; end if;
  if not public.session_security_satisfied(true) then
    raise exception using errcode='42501',message='Confirmez la double authentification pour continuer.',detail='MFA_REQUIRED';
  end if;
  if not p_allow_temporary_password and not public.session_security_satisfied(false) then
    raise exception using errcode='42501',message='Remplacez votre mot de passe temporaire pour continuer.',detail='PASSWORD_CHANGE_REQUIRED';
  end if;
end;
$$;
revoke all on function public.assert_session_security(boolean) from public,anon;
grant execute on function public.assert_session_security(boolean) to authenticated;

create or replace function public.claim_payment_provider_request(p_payment_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_claimed uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  update public.payment_transactions set provider_request_started_at=clock_timestamp()
  where id=p_payment_id and status='pending' and provider_reference is null
    and (provider_request_started_at is null or (provider='stripe'
      and created_at>clock_timestamp()-interval '23 hours'
      and provider_request_started_at<clock_timestamp()-interval '5 minutes'))
  returning id into v_claimed;
  return v_claimed is not null;
end $$;

create or replace function public.release_payment_provider_request(p_payment_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  update public.payment_transactions set provider_request_started_at=null
  where id=p_payment_id and status='pending' and provider_reference is null;
end $$;
revoke all on function public.claim_payment_provider_request(uuid), public.release_payment_provider_request(uuid) from public,anon,authenticated;
grant execute on function public.claim_payment_provider_request(uuid), public.release_payment_provider_request(uuid) to service_role;

-- Filter before pagination; financial columns remain private.
create or replace function public.get_filtered_sales_history(
  p_company_id uuid, p_store_id uuid, p_offset integer default 0, p_limit integer default 30,
  p_search text default null, p_after timestamptz default null, p_before timestamptz default null,
  p_payment text default null, p_status text default 'all'
) returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(row_data order by created_at desc,id desc),'[]'::jsonb)
  from (
    select s.id,s.created_at, jsonb_build_object(
      'id',s.id,'company_id',s.company_id,'store_id',s.store_id,'customer_id',s.customer_id,
      'reference',s.reference,'subtotal',s.subtotal,'discount_total',s.discount_total,
      'total',s.total,'amount_paid',s.amount_paid,'amount_due',s.amount_due,
      'payment_status',s.payment_status,'currency_code',s.currency_code,
      'secondary_currency_code',s.secondary_currency_code,
      'secondary_exchange_rate',s.secondary_exchange_rate,
      'exchange_rate_effective_at',s.exchange_rate_effective_at,
      'payment_method',s.payment_method,'created_by',s.created_by,'created_at',s.created_at,
      'store',jsonb_build_object('name',st.name),
      'customer',case when c.id is null then null else jsonb_build_object('name',c.name) end,
      'creator',case when pr.id is null then null else jsonb_build_object('full_name',pr.full_name) end
    ) row_data
    from public.sales s join public.stores st on st.id=s.store_id
    left join public.customers c on c.id=s.customer_id and c.company_id=s.company_id
    left join public.profiles pr on pr.id=s.created_by
    where s.company_id=p_company_id and s.store_id=p_store_id
      and public.belongs_to_company(s.company_id)
      and public.can_access_store(s.company_id,s.store_id)
      and public.has_permission(s.company_id,'sales.read')
      and (nullif(btrim(p_search),'') is null or strpos(lower(coalesce(s.reference,'')||' '||coalesce(c.name,'')),lower(btrim(p_search))) > 0)
      and (p_after is null or s.created_at >= p_after)
      and (p_before is null or s.created_at < p_before)
      and (p_payment is null or s.payment_method::text=p_payment)
      and (coalesce(p_status,'all')='all' or (p_status='paid' and s.amount_due<=0) or (p_status='due' and s.amount_due>0))
    order by s.created_at desc,s.id desc offset greatest(coalesce(p_offset,0),0)
    limit least(greatest(coalesce(p_limit,30),1),100)
  ) rows;
$$;

grant execute on function public.get_filtered_sales_history(uuid,uuid,integer,integer,text,timestamptz,timestamptz,text,text) to authenticated;
revoke all on function public.get_filtered_sales_history(uuid,uuid,integer,integer,text,timestamptz,timestamptz,text,text) from public,anon;

notify pgrst,'reload schema';
commit;
