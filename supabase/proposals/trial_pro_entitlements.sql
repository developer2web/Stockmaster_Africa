-- Proposition non déployée : un essai valide expose les fonctionnalités Pro.
-- À valider séparément car cette règle modifie les droits de toutes les entreprises en essai.

create or replace function public.can_use_feature(p_company_id uuid,p_feature_key text)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select public.is_super_admin() or coalesce((
    select
      case
        when s.status='trialing' then exists(
          select 1
          from public.plans trial_plan
          join public.plan_features trial_feature
            on trial_feature.plan_id=trial_plan.id
           and trial_feature.feature_key=p_feature_key
           and trial_feature.is_enabled
          where trial_plan.code='pro' and trial_plan.is_active
        )
        else coalesce(actual_feature.is_enabled,false)
      end
      and (
        s.status in ('trialing','active')
          and coalesce(s.expires_at,s.current_period_ends_at,s.trial_ends_at)>now()
        or s.status='past_due' and s.grace_period_ends_at>now()
      )
    from public.subscriptions s
    join public.plans actual_plan on actual_plan.id=s.plan_id and actual_plan.is_active
    left join public.plan_features actual_feature
      on actual_feature.plan_id=actual_plan.id
     and actual_feature.feature_key=p_feature_key
    where s.company_id=p_company_id
      and public.belongs_to_company(p_company_id)
    order by s.created_at desc
    limit 1
  ),false)
$$;

grant execute on function public.can_use_feature(uuid,text) to authenticated;
revoke all on function public.can_use_feature(uuid,text) from anon;

comment on function public.can_use_feature(uuid,text) is
  'Returns server-authoritative entitlements; valid trials always receive the Pro feature set.';
