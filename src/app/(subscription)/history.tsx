import { useQuery } from '@tanstack/react-query';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Card, Chip, Text } from 'react-native-paper';

import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { getPaymentHistory } from '@/features/subscriptions/api';
import { AppBackButton } from '@/components/ui/AppBackButton';

export default function PaymentHistoryScreen() {
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
              subtitle={`${payment.provider} · ${new Date(payment.created_at).toLocaleString('fr-CA')}`}
              right={() => <Chip style={styles.chip}>{({processing:'En vérification',pending:'En attente',succeeded:'Payé',failed:'Refusé',cancelled:'Annulé',expired:'Expiré'} as Record<string,string>)[payment.status]??payment.status}</Chip>}
            />
            <Card.Content>
              <Text>{new Intl.NumberFormat('fr-CA', { style: 'currency', currency: payment.currency, currencyDisplay: 'code' }).format(Number(payment.amount))}</Text>
              <Text>{payment.provider==='orange_money_manual'?'Orange Money':payment.provider==='stripe'?'Carte bancaire / Stripe':payment.provider}</Text>
              {Number(payment.discount_amount)>0&&<Text>Réduction : {payment.discount_amount} {payment.currency}</Text>}
              {!!payment.failure_reason && <Text>{payment.failure_reason}</Text>}
            </Card.Content>
          </Card>
        ))}
        {!query.data?.length && <Text>Aucun paiement enregistré.</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  page: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 18, gap: 12 },
  chip: { marginRight: 12 },
});
