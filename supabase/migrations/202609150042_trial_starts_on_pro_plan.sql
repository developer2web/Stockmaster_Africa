-- L'essai gratuit (14 jours, toute nouvelle entreprise) démarrait sur le
-- forfait Basic — texte de l'écran de bienvenue explicite : « Testez les
-- fonctions incluses dans le forfait de démarrage ». Changé pour démarrer
-- directement sur Pro, pour que l'essai donne accès à toutes les
-- fonctionnalités sans qu'aucune ne semble manquante/verrouillée pendant la
-- découverte. Rien ne change après l'essai : le choix d'abonnement réel
-- (Basic/Pro/Business) reste entier au moment de payer.
--
-- Trouvé au passage en cherchant la bonne fonction en direct (la recherche
-- par nom a échoué avec "more than one function named ...") : deux
-- surcharges à 2 arguments (bootstrap_company, create_business), jamais
-- appelées nulle part dans le code (vérifié), qui traînaient depuis la
-- toute première migration sans jamais avoir été supprimées explicitement.
-- create_business(text,text) codait même en dur 'CA' (Canada) comme pays.
-- Supprimées ici : aucun appelant réel ne les utilise, et elles gênaient
-- déjà les outils de diagnostic de cette session.
drop function if exists public.bootstrap_company(text,text);
drop function if exists public.create_business(text,text);

create or replace function public.create_business(
  p_company_name text,
  p_store_name text,
  p_country_code text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_store uuid;
  v_admin uuid;
  v_manager uuid;
  v_plan uuid;
  v_map country_currency_map%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(trim(p_company_name)) < 2 or length(trim(p_store_name)) < 2 then
    raise exception 'Nom invalide';
  end if;

  select * into v_map from country_currency_map
  where country_code = upper(trim(p_country_code)) and is_active;
  if not found then raise exception 'Pays non pris en charge'; end if;

  insert into companies(name, country_code, country_name, default_currency_code, created_by)
  values(trim(p_company_name), v_map.country_code, v_map.country_name,
    v_map.default_currency_code, auth.uid())
  returning id into v_company;

  insert into stores(company_id, name, created_by)
  values(v_company, trim(p_store_name), auth.uid()) returning id into v_store;
  insert into roles(company_id, name, code, created_by)
  values(v_company, 'Propriétaire', 'company_admin', auth.uid()) returning id into v_admin;
  insert into memberships(company_id, user_id, role_id, store_id, all_stores, created_by)
  values(v_company, auth.uid(), v_admin, v_store, true, auth.uid());
  insert into client_businesses(client_id, company_id, is_primary, created_by)
  values(auth.uid(), v_company,
    not exists(select 1 from client_businesses where client_id = auth.uid()), auth.uid());
  insert into membership_stores(company_id, membership_id, store_id, created_by)
  select v_company, id, v_store, auth.uid() from memberships
  where company_id = v_company and user_id = auth.uid();

  -- Employé and Comptable are created by the company trigger.
  insert into roles(company_id, name, code, created_by)
  values(v_company, 'Manager', 'employee', auth.uid()) returning id into v_manager;
  insert into role_permissions(company_id, role_id, permission_id, created_by)
  select v_company, v_manager, p.id, auth.uid() from permissions p where p.code in ('notifications.read',
    'stores.read', 'stores.write', 'products.read', 'products.write',
    'categories.read', 'categories.write', 'suppliers.read', 'suppliers.write',
    'product_variants.read', 'product_variants.write',
    'stock_movements.read', 'stock_movements.write',
    'sales.read', 'sales.write', 'expenses.read', 'expenses.write',
    'cash_transactions.read', 'cash_transactions.write',
    'daily_reports.read', 'monthly_reports.read'
  );

  -- Essai gratuit démarré directement sur Pro (voir commentaire en tête de
  -- fichier) : auparavant 'basic'.
  select id into v_plan from subscription_plans where code = 'pro';
  insert into subscriptions(company_id, plan_id, status, trial_ends_at,
    current_period_ends_at, created_by)
  values(v_company, v_plan, 'trialing', now() + interval '14 days',
    now() + interval '14 days', auth.uid());
  return v_company;
end;
$$;

grant execute on function public.create_business(text, text, text) to authenticated;
revoke all on function public.create_business(text, text, text) from anon;

create or replace function public.bootstrap_company(
  p_company_name text,
  p_store_name text,
  p_country_code text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_company uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));

  select m.company_id
    into v_existing_company
  from public.memberships m
  join public.companies c on c.id = m.company_id
  where m.user_id = auth.uid()
    and m.is_active
    and c.is_active
  order by m.created_at
  limit 1;

  if v_existing_company is not null then
    return v_existing_company;
  end if;

  return public.create_business(p_company_name, p_store_name, p_country_code);
end;
$$;
grant execute on function public.bootstrap_company(text, text, text) to authenticated;
revoke all on function public.bootstrap_company(text, text, text) from anon;

-- Même alignement pour l'octroi manuel d'essai par le Super Admin (cas
-- exceptionnel, ex. sur demande) : seul le défaut change (basic -> pro),
-- reprend sinon exactement la version en production (vérifiée en direct
-- avant modification) qui permet déjà de choisir explicitement le forfait
-- via p_plan_code — cette liberté reste entière, seul ce qui se passe sans
-- rien préciser s'aligne sur le nouvel essai standard ci-dessus.
create or replace function public.super_admin_grant_trial(p_company_id uuid, p_days integer default null, p_plan_code text default 'pro')
returns uuid language plpgsql security definer set search_path=public as $$
declare v_client uuid;v_plan uuid;v_subscription uuid;v_days integer;v_expires timestamptz;
begin
  if not public.is_super_admin() then raise exception 'Accès Super Admin requis';end if;
  select coalesce(p_days,trial_days) into v_days from billing_settings where id;
  if v_days<1 or v_days>90 then raise exception 'Durée d''essai invalide';end if;
  if p_plan_code='business' then p_plan_code:='premium';end if;
  if p_plan_code not in ('basic','pro','premium') then raise exception 'Forfait d''essai invalide';end if;
  if exists(
    select 1 from subscriptions where company_id=p_company_id and status='active'
    and coalesce(expires_at,current_period_ends_at)>now()
  ) then raise exception 'Cette entreprise possède déjà un abonnement actif';end if;
  select cb.client_id into v_client from client_businesses cb
  where cb.company_id=p_company_id order by cb.is_primary desc,cb.created_at limit 1;
  if v_client is null then raise exception 'Propriétaire de l''entreprise introuvable';end if;
  select id into v_plan from plans where code=p_plan_code and is_active;
  if v_plan is null then raise exception 'Forfait d''essai indisponible';end if;
  v_expires:=now()+make_interval(days=>v_days);
  update subscriptions set status='expired'
  where company_id=p_company_id and status in ('pending','trialing','past_due');
  insert into subscriptions(
    company_id,client_id,plan_id,status,payment_provider,payment_reference,billing_cycle,
    starts_at,trial_ends_at,expires_at,current_period_ends_at,grace_period_ends_at,auto_renew,created_by
  )
  select p_company_id,v_client,v_plan,'trialing','free_trial','trial-'||gen_random_uuid()::text,'monthly',
    now(),v_expires,v_expires,v_expires,v_expires+make_interval(days=>grace_period_days),false,auth.uid()
  from billing_settings where id
  returning id into v_subscription;
  insert into audit_logs(company_id,actor_id,action,entity_type,entity_id,payload,created_by)
  values(p_company_id,auth.uid(),'grant_free_trial','subscriptions',v_subscription,
    jsonb_build_object('days',v_days,'plan_code',p_plan_code),auth.uid());
  return v_subscription;
end $$;

grant execute on function public.super_admin_grant_trial(uuid,integer,text) to authenticated;
revoke all on function public.super_admin_grant_trial(uuid,integer,text) from anon;
