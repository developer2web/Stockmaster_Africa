import { PropsWithChildren, ReactNode, useState } from 'react';
import { Card, HelperText, Icon, Text } from 'react-native-paper';

import { AppButton } from '@/components/ui/AppButton';
import { useSubscription } from '@/features/subscriptions/SubscriptionProvider';
import type { FeatureKey } from '@/features/subscriptions/types';
import { openAccountPortal } from '@/features/subscriptions/accountPortal';
import { useAuth } from '@/features/auth/AuthProvider';
import { LoadingScreen } from '@/components/ui/LoadingScreen';

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
  const { canUseFeature, isLoading, subscription, error: subscriptionError, refreshSubscription } = useSubscription();
  const { membership } = useAuth();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  if (isLoading) return <LoadingScreen label="Vérification du forfait…" />;
  if (subscriptionError) return <Card mode="outlined"><Card.Content><Text>Impossible de vérifier les fonctionnalités de votre abonnement.</Text><AppButton mode="text" onPress={() => void refreshSubscription()}>Réessayer la vérification</AppButton></Card.Content></Card>;
  if (canUseFeature(feature)) return children;
  if (fallback !== undefined) return fallback;
  return (
    <Card mode="outlined">
      <Card.Content style={{ alignItems: 'center', gap: 10, paddingVertical: 24 }}>
        <Icon source="lock-outline" size={34} />
        <Text variant="titleMedium">{label} — Verrouillé</Text>
        <Text style={{ textAlign: 'center' }}>
          {(subscription?.isReadOnly || !['active', 'trialing', 'past_due'].includes(subscription?.status ?? '')) ? 'Votre abonnement ne permet pas actuellement cette opération. Vos données restent conservées.' : `Cette fonctionnalité n’est pas incluse dans votre forfait ${subscription?.planName ?? 'actuel'}. Vos données existantes restent conservées.`}
        </Text>
        {membership?.role === 'company_admin' ? <AppButton loading={opening} disabled={opening} onPress={() => { setOpening(true); setError(''); void openAccountPortal(membership?.companyId ?? '').catch((caught) => setError(caught.message)).finally(() => setOpening(false)); }}>Gérer l’abonnement</AppButton> : <Text>Contactez le propriétaire pour gérer l’abonnement.</Text>}
        {!!error && <HelperText type="error" visible>{error}</HelperText>}
      </Card.Content>
    </Card>
  );
}
