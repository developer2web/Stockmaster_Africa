import { router } from 'expo-router';
import { PropsWithChildren, ReactNode } from 'react';
import { Card, Icon, Text } from 'react-native-paper';

import { AppButton } from '@/components/ui/AppButton';
import { useSubscription } from '@/features/subscriptions/SubscriptionProvider';
import type { FeatureKey } from '@/features/subscriptions/types';

export function FeatureGate({
  feature,
  label,
  children,
  fallback,
}: PropsWithChildren<{
  feature: FeatureKey;
  label: string;
  fallback?: ReactNode;
}>) {
  const { canUseFeature, isLoading, subscription } = useSubscription();
  if (isLoading) return null;
  if (canUseFeature(feature)) return children;
  if (fallback !== undefined) return fallback;
  return (
    <Card mode="outlined">
      <Card.Content style={{ alignItems: 'center', gap: 10, paddingVertical: 24 }}>
        <Icon source="lock-outline" size={34} />
        <Text variant="titleMedium">{label} — Verrouillé</Text>
        <Text style={{ textAlign: 'center' }}>
          Cette fonctionnalité n’est pas incluse dans votre forfait {subscription?.planName ?? 'actuel'}. Vos données existantes restent conservées.
        </Text>
        <AppButton onPress={() => router.push('/(subscription)' as never)}>Mettre à niveau</AppButton>
      </Card.Content>
    </Card>
  );
}
