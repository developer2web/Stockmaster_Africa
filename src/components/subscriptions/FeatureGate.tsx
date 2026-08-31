import { PropsWithChildren, ReactNode, useState } from 'react';
import { Card, HelperText, Icon, Text } from 'react-native-paper';

import { AppButton } from '@/components/ui/AppButton';
import { useSubscription } from '@/features/subscriptions/SubscriptionProvider';
import type { FeatureKey } from '@/features/subscriptions/types';
import { openAccountPortal } from '@/features/subscriptions/accountPortal';
import { useAuth } from '@/features/auth/AuthProvider';

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
  const { membership } = useAuth();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
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
        <AppButton loading={opening} disabled={opening} onPress={() => { setOpening(true); setError(''); void openAccountPortal(membership?.companyId ?? '').catch((caught) => setError(caught.message)).finally(() => setOpening(false)); }}>Mettre à niveau</AppButton>
        {!!error && <HelperText type="error" visible>{error}</HelperText>}
      </Card.Content>
    </Card>
  );
}
