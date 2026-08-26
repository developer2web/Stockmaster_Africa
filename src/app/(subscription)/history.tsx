import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Card, Text } from 'react-native-paper';

import { AppButton } from '@/components/ui/AppButton';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import { useReceiptBranding } from '@/features/payments/branding';
import { printPaymentReceipt, sharePaymentReceipt } from '@/features/payments/receipt';
import { useReceiptAction } from '@/features/payments/useReceiptAction';
import { getPaymentHistory } from '@/features/subscriptions/api';
import { AppBackButton } from '@/components/ui/AppBackButton';
import { StatusChip } from '@/components/ui/StatusChip';
import { AppFeedback } from '@/components/ui/AppFeedback';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency,formatDateTime } from '@/utils/format';

export default function PaymentHistoryScreen() {
  const { formatForCurrency } = useCurrency();
  const branding = useReceiptBranding(undefined, null);
  const receiptAction = useReceiptAction();
  const [message, setMessage] = useState('');
  const query = useQuery({ queryKey: ['payment-history'], queryFn: getPaymentHistory });
  if (query.isLoading) return <LoadingScreen label="Chargement des paiements…" />;
  if (query.error) return <ErrorState message={query.error.message} onRetry={() => query.refetch()} />;
  return (
    <View style={styles.screen}>
      <Appbar.Header>
        <AppBackButton fallback="/(subscription)" />
        <Appbar.Content title="Historique des paiements" />
      </Appbar.Header>
      <ScrollView contentContainerStyle={styles.page}>
        {(query.data ?? []).map((payment) => (
          <Card key={payment.id} mode="outlined">
            <Card.Title
              title={payment.plan?.name ?? 'Forfait'}
              subtitle={`${payment.provider==='orange_money_manual'?'Orange Money':payment.provider==='stripe'?'Carte bancaire':payment.provider} · ${formatDateTime(payment.created_at)}`}
              right={() => <StatusChip style={styles.chip} status={payment.status}/>}
            />
            <Card.Content>
              <Text>{formatCurrency(payment.amount,payment.currency)}</Text>
              <Text>{payment.provider==='orange_money_manual'?'Orange Money':payment.provider==='stripe'?'Carte bancaire / Stripe':payment.provider}</Text>
              {Number(payment.discount_amount)>0&&<Text>Réduction : {payment.discount_amount} {payment.currency}</Text>}
              {!!payment.failure_reason && <Text>{payment.failure_reason}</Text>}
            </Card.Content>
            {payment.status === 'succeeded' && <Card.Actions>{(() => {
              const receipt = {
                ...branding,
                title: 'Reçu d’abonnement',
                party: branding.company,
                partyLabel: 'Abonné',
                amount: Number(payment.amount),
                balanceBefore: 0,
                balanceAfter: 0,
                date: payment.confirmed_at ?? payment.created_at,
                reference: payment.provider_reference || `ABONNEMENT-${payment.id.slice(0, 8).toUpperCase()}`,
                amountLabel: 'Montant réglé',
                note: `${payment.plan?.name ?? 'Forfait'} · ${payment.billing_cycle === 'annual' ? 'Annuel' : 'Mensuel'}`,
                showBalances: false,
              };
              const format = (value: number) => formatForCurrency(value, payment.currency);
              const printKey = `subscription-print-${payment.id}`;
              const shareKey = `subscription-share-${payment.id}`;
              return <>
                <AppButton mode="text" icon="printer" loading={receiptAction.runningKey === printKey} disabled={!!receiptAction.runningKey} onPress={() => void receiptAction.run(printKey, async () => { await printPaymentReceipt(receipt, format); setMessage('Reçu prêt à imprimer.'); })}>Imprimer</AppButton>
                <AppButton mode="text" icon="share-variant" loading={receiptAction.runningKey === shareKey} disabled={!!receiptAction.runningKey} onPress={() => void receiptAction.run(shareKey, async () => { await sharePaymentReceipt(receipt, format); setMessage('Reçu partagé.'); })}>Partager</AppButton>
              </>;
            })()}</Card.Actions>}
          </Card>
        ))}
        {!query.data?.length && <EmptyState icon="credit-card-outline" title="Aucun paiement" message="Les paiements d’abonnement apparaîtront ici."/>}
      </ScrollView>
      <AppFeedback message={message} onDismiss={() => setMessage('')}/>
      <AppFeedback message={receiptAction.error??''} type="error" onDismiss={receiptAction.clearError}/>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  page: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 18, gap: 12 },
  chip: { marginRight: 12 },
});
