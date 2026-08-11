import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Card, Icon, Text } from 'react-native-paper';

import { AppButton } from '@/components/ui/AppButton';
import { checkPaymentStatus } from '@/features/subscriptions/api';
import { useSubscription } from '@/features/subscriptions/SubscriptionProvider';

export default function PaymentStatusScreen() {
  const { transactionId } = useLocalSearchParams<{ transactionId: string }>();
  const { refreshSubscription } = useSubscription();
  const query = useQuery({
    queryKey: ['payment-status', transactionId],
    queryFn: () => checkPaymentStatus(transactionId),
    enabled: !!transactionId,
    refetchInterval: (state) =>
      ['succeeded', 'failed', 'cancelled', 'expired'].includes(state.state.data?.status ?? '')
        ? false
        : 4_000,
  });
  const status = query.data?.status ?? 'pending';
  const success = status === 'succeeded';
  const manualReview = status === 'processing' && query.data?.provider === 'orange_money_manual';
  const terminal = success || ['failed', 'cancelled', 'expired'].includes(status);
  return (
    <View style={styles.screen}>
      <Card style={styles.card}>
        <Card.Content style={styles.content}>
          {terminal
            ? <Icon source={success ? 'check-circle' : 'alert-circle'} size={52} />
            : manualReview ? <Icon source="clock-check-outline" size={52} /> : <ActivityIndicator size="large" />}
          <Text variant="headlineSmall">{success ? 'Paiement confirmé' : terminal ? 'Paiement non confirmé' : manualReview ? 'Paiement en vérification' : 'Confirmation en cours'}</Text>
          <Text style={styles.center}>
            {success
              ? 'Votre forfait a été activé par le serveur.'
              : terminal
                ? `Statut reçu : ${status}. Aucun forfait n’a été activé.`
                : manualReview ? 'Votre référence et votre preuve ont été transmises. Le Super Admin doit vérifier la réception réelle avant activation.' : 'Validez la demande sur votre téléphone. Cette page ne peut pas activer le forfait elle-même.'}
          </Text>
          <AppButton
            onPress={async () => {
              if (success) await refreshSubscription();
              router.replace(success ? '/' : '/(subscription)' as never);
            }}
          >
            {success ? 'Ouvrir StockMaster' : manualReview ? 'Voir l’abonnement' : 'Voir les forfaits'}
          </AppButton>
        </Card.Content>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 520, alignSelf: 'center' },
  content: { alignItems: 'center', gap: 16, paddingVertical: 28 },
  center: { textAlign: 'center' },
});
