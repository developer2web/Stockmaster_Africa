import { useQuery } from '@tanstack/react-query';
import { createContext, PropsWithChildren, useContext } from 'react';

import { useAuth } from '@/features/auth/AuthProvider';
import { checkSubscriptionUsage, getCurrentSubscription, getPlans } from './api';
import type { FeatureKey, SubscriptionContextValue, SubscriptionPlan } from './types';

type SubscriptionValue = {
  subscription: SubscriptionContextValue | null;
  plans: SubscriptionPlan[];
  isLoading: boolean;
  error: Error | null;
  canUseFeature: (featureKey: FeatureKey) => boolean;
  getUsageLimit: (featureKey: FeatureKey) => number | null;
  getSubscriptionLimits: () => {
    maxBusinesses: number;
    maxStores: number;
    maxEmployees: number;
  };
  checkUsageLimit: (featureKey: FeatureKey) => Promise<boolean>;
  requireActiveSubscription: () => SubscriptionContextValue;
  refreshSubscription: () => Promise<void>;
};

const SubscriptionContext = createContext<SubscriptionValue | null>(null);

export function SubscriptionProvider({ children }: PropsWithChildren) {
  const { session, membership } = useAuth();
  const companyId = membership?.companyId ?? '';
  const plansQuery = useQuery({
    queryKey: ['plans'],
    queryFn: getPlans,
    enabled: !!session,
  });
  const subscriptionQuery = useQuery({
    queryKey: ['subscription-context', companyId],
    queryFn: () => getCurrentSubscription(companyId),
    enabled: !!session && !!companyId && membership?.role !== 'super_admin',
  });

  const subscription = subscriptionQuery.data ?? null;
  const plan = plansQuery.data?.find((item) => item.id === subscription?.planId);
  const value: SubscriptionValue = {
    subscription,
    plans: plansQuery.data ?? [],
    isLoading: plansQuery.isLoading || subscriptionQuery.isLoading,
    error: (plansQuery.error ?? subscriptionQuery.error) as Error | null,
    canUseFeature: (featureKey) => {
      if (membership?.role === 'super_admin') return true;
      if (!subscription || subscription.isReadOnly) return false;
      return !!plan?.features.find((feature) => feature.featureKey === featureKey)?.isEnabled;
    },
    getUsageLimit: (featureKey) =>
      plan?.features.find((feature) => feature.featureKey === featureKey)?.usageLimit ?? null,
    getSubscriptionLimits: () => ({
      maxBusinesses: subscription?.maxBusinesses ?? 0,
      maxStores: subscription?.maxStores ?? 0,
      maxEmployees: subscription?.maxEmployees ?? 0,
    }),
    checkUsageLimit: async (featureKey) => {
      if (!subscription?.subscriptionId || !plan) return false;
      const limit = plan.features.find((feature) => feature.featureKey === featureKey)?.usageLimit ?? null;
      return checkSubscriptionUsage(subscription.subscriptionId, featureKey, limit);
    },
    requireActiveSubscription: () => {
      if (!subscription || subscription.isReadOnly) {
        throw new Error('Un abonnement actif est requis pour cette opération.');
      }
      return subscription;
    },
    refreshSubscription: async () => {
      await Promise.all([plansQuery.refetch(), subscriptionQuery.refetch()]);
    },
  };

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription() {
  const value = useContext(SubscriptionContext);
  if (!value) throw new Error('useSubscription doit être utilisé dans SubscriptionProvider');
  return value;
}
