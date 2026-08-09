-- Ne pas commercialiser de fonctionnalités qui ne sont pas encore livrées.
delete from public.plan_features
where feature_key in (
  'notifications',
  'ai_summary',
  'ai_assistant',
  'offline_mode'
);

update public.plans
set
  ai_requests_limit=0,
  description=case code
    when 'basic' then 'Stock, produits, ventes et rapports simples.'
    when 'pro' then 'Gestion avancée, exports et suivi des dépenses.'
    when 'premium' then 'Multi-entreprises, multi-boutiques et rapports avancés.'
    else description
  end,
  updated_at=now();

delete from public.subscription_usage
where feature_key in (
  'notifications',
  'ai_summary',
  'ai_assistant',
  'offline_mode'
);
