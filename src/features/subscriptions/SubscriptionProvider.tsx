import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, PropsWithChildren, useContext, useEffect } from 'react';
import { AppState } from 'react-native';
import { canUsePlanFeature } from './featureAccess';
import { isSubscriptionReadOnly, registerSubscriptionAccess } from './readOnlyAccess';

import { useAuth } from '@/features/auth/AuthProvider';
import { checkSubscriptionUsage, getCurrentSubscription, getPlans } from './api';
import type { FeatureKey, SubscriptionContextValue, SubscriptionPlan } from './types';

type SubscriptionValue = {
  subscription: SubscriptionContextValue | null;
  plans: SubscriptionPlan[];
  isLoading: boolean;
  error: Error | null;
  canViewFeature: (featureKey: FeatureKey) => boolean;
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
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!companyId) return;
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') {
        void queryClient.invalidateQueries({ queryKey: ['plans', companyId] });
        void queryClient.invalidateQueries({ queryKey: ['subscription-context', companyId] });
      }
    });
    return () => listener.remove();
  }, [companyId, queryClient]);
  const plansQuery = useQuery({
    queryKey: ['plans', companyId],
    queryFn: () => getPlans(companyId),
    enabled: !!session && !!companyId && membership?.role !== 'super_admin',
    refetchOnWindowFocus: 'always',
    refetchInterval: 60_000,
  });
  const subscriptionQuery = useQuery({
    queryKey: ['subscription-context', companyId],
    queryFn: () => getCurrentSubscription(companyId),
    enabled: !!session && !!companyId && membership?.role !== 'super_admin',
    refetchOnWindowFocus: 'always',
    refetchInterval: 60_000,
  });

  const subscription = subscriptionQuery.data ?? null;
  useEffect(() => registerSubscriptionAccess({ companyId, subscription, superAdmin: membership?.role === 'super_admin' }), [companyId, subscription, membership?.role]);
  const plan = plansQuery.data?.find((item) => item.id === subscription?.planId);
  const value: SubscriptionValue = {
    subscription,
    plans: plansQuery.data ?? [],
    isLoading: plansQuery.isLoading || subscriptionQuery.isLoading,
    error: (plansQuery.error ?? subscriptionQuery.error) as Error | null,
    canViewFeature: (featureKey) => membership?.role === 'super_admin' || (!!subscription && !subscriptionQuery.error && (isSubscriptionReadOnly(subscription) || canUsePlanFeature(subscription, plan, featureKey))),
    canUseFeature: (featureKey) => {
      if (membership?.role === 'super_admin') return true;
      if (plansQuery.error || subscriptionQuery.error) return false;
      return !isSubscriptionReadOnly(subscription) && canUsePlanFeature(subscription, plan, featureKey);
    },
    getUsageLimit: (featureKey) =>
      plan?.features.find((feature) => feature.featureKey === featureKey)?.usageLimit ?? null,
    getSubscriptionLimits: () => ({
      maxBusinesses: subscription?.maxBusinesses ?? 0,
      maxStores: subscription?.maxStores ?? 0,
      maxEmployees: subscription?.maxEmployees ?? 0,
    }),
    checkUsageLimit: async (featureKey) => {
      if (!subscription?.subscriptionId || isSubscriptionReadOnly(subscription) || !plan || plansQuery.error || subscriptionQuery.error || !canUsePlanFeature(subscription, plan, featureKey)) return false;
      const limit = plan.features.find((feature) => feature.featureKey === featureKey)?.usageLimit ?? null;
      return checkSubscriptionUsage(subscription.subscriptionId, featureKey, limit);
    },
    requireActiveSubscription: () => {
      if (!subscription || isSubscriptionReadOnly(subscription)) {
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
