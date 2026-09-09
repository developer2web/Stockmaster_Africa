import type { FeatureKey, SubscriptionContextValue, SubscriptionPlan } from './types';

export function canUsePlanFeature(subscription: SubscriptionContextValue | null, plan: SubscriptionPlan | undefined, key: FeatureKey) {
  return !!subscription && !subscription.isReadOnly
    && ['active', 'trialing', 'past_due'].includes(subscription.status ?? '')
    && !!plan && plan.id === subscription.planId
    && plan.features.some(feature => feature.featureKey === key && feature.isEnabled);
}

export const moduleFeatures: Record<string, FeatureKey> = {
  'Produits': 'inventory',
  'Clients et crédits': 'customers_suppliers',
  'Recevoir du stock': 'inventory',
  'Fournisseurs': 'customers_suppliers',
  'Dépenses': 'expenses',
  'Compter le stock': 'inventory_count',
  'Rôles': 'advanced_permissions',
  'Journal d’activité': 'audit_log',
};
