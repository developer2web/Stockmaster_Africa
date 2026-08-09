import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Card, Chip, SegmentedButtons, Text, useTheme } from 'react-native-paper';

import { AppButton } from '@/components/ui/AppButton';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { useAuth } from '@/features/auth/AuthProvider';
import { useSubscription } from '@/features/subscriptions/SubscriptionProvider';
import type { BillingCycle } from '@/features/subscriptions/types';
import { safeBack } from '@/utils/navigation';

const featureLabels: Record<string, string> = {
  inventory: 'Produits et stock',
  sales: 'Ventes',
  expenses: 'Dépenses',
  advanced_reports: 'Rapports avancés',
  pdf_export: 'Export PDF',
  excel_export: 'Export Excel',
  multi_business: 'Multi-entreprises',
  multi_store: 'Multi-boutiques',
};

export default function SubscriptionScreen() {
  const theme = useTheme();
  const { membership } = useAuth();
  const { subscription, plans, isLoading, error, refreshSubscription } = useSubscription();
  const [cycle, setCycle] = useState<BillingCycle>('monthly');

  if (isLoading) return <LoadingScreen label="Chargement des forfaits…" />;
  if (error) return <ErrorState message={error.message} onRetry={() => void refreshSubscription()} />;

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => safeBack('/')} />
        <Appbar.Content title="Forfaits StockMaster" />
        {membership?.role === 'company_admin' && (
          <Appbar.Action icon="history" onPress={() => router.push('/(subscription)/history' as never)} />
        )}
      </Appbar.Header>
      <ScrollView contentContainerStyle={styles.page}>
        {subscription && (
          <Card mode="contained">
            <Card.Title
              title={`Forfait actuel : ${subscription.planName}`}
              subtitle={`Statut : ${subscription.status ?? 'inconnu'}`}
              right={() => <Chip style={styles.chip}>{subscription.isReadOnly ? 'Lecture seule' : 'Actif'}</Chip>}
            />
            <Card.Content>
              <Text>
                Expiration : {subscription.expiresAt
                  ? new Date(subscription.expiresAt).toLocaleDateString('fr-CA')
                  : 'non définie'}
              </Text>
            </Card.Content>
          </Card>
        )}

        <SegmentedButtons
          value={cycle}
          onValueChange={(value) => setCycle(value as BillingCycle)}
          buttons={[
            { value: 'monthly', label: 'Mensuel' },
            { value: 'annual', label: 'Annuel' },
          ]}
        />

        <View style={styles.grid}>
          {plans.map((plan) => {
            const price = cycle === 'monthly' ? plan.monthlyPrice : plan.annualPrice;
            const active = plan.id === subscription?.planId;
            return (
              <Card
                key={plan.id}
                mode={active ? 'contained' : 'outlined'}
                style={[styles.plan, active && { borderColor: theme.colors.primary }]}
              >
                <Card.Title
                  title={plan.name}
                  subtitle={plan.description}
                  right={() => active ? <Chip style={styles.chip}>Actuel</Chip> : null}
                />
                <Card.Content style={styles.planContent}>
                  <Text variant="headlineMedium" style={styles.bold}>
                    {new Intl.NumberFormat('fr-CA', {
                      style: 'currency',
                      currency: plan.currency,
                      currencyDisplay: 'code',
                    }).format(price)}
                  </Text>
                  <Text>{cycle === 'monthly' ? 'par mois' : 'par année'}</Text>
                  <Text>{plan.maxBusinesses} entreprise(s) · {plan.maxStores} boutique(s)</Text>
                  <Text>{plan.maxEmployees} employé(s) actif(s)</Text>
                  {plan.features.filter((feature) => feature.isEnabled).map((feature) => (
                    <Text key={feature.featureKey}>✓ {featureLabels[feature.featureKey] ?? feature.featureKey}</Text>
                  ))}
                  {membership?.role === 'company_admin' && (
                    <AppButton
                      disabled={active && !subscription?.isReadOnly}
                      onPress={() => router.push({
                        pathname: '/(subscription)/payment' as never,
                        params: { planId: plan.id, cycle },
                      })}
                    >
                      {active ? 'Renouveler' : 'Choisir ce forfait'}
                    </AppButton>
                  )}
                </Card.Content>
              </Card>
            );
          })}
        </View>
        {membership?.role === 'employee' && (
          <Text style={styles.center}>
            Seul le propriétaire peut acheter ou modifier le forfait. Contactez votre administrateur.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  page: { width: '100%', maxWidth: 1100, alignSelf: 'center', padding: 18, paddingBottom: 40, gap: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  plan: { flexGrow: 1, flexBasis: 300, borderRadius: 22 },
  planContent: { gap: 9 },
  bold: { fontWeight: '800' },
  chip: { marginRight: 12 },
  center: { textAlign: 'center' },
});
