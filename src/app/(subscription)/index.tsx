import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Card, Chip, Dialog, Portal, SegmentedButtons, Text, useTheme } from 'react-native-paper';

import { AppButton } from '@/components/ui/AppButton';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { useAuth } from '@/features/auth/AuthProvider';
import { useSubscription } from '@/features/subscriptions/SubscriptionProvider';
import type { BillingCycle } from '@/features/subscriptions/types';
import { AppBackButton } from '@/components/ui/AppBackButton';
import { formatDate } from '@/utils/format';

const featureLabels: Record<string, string> = {
  inventory: 'Produits et stock',
  sales: 'Ventes',
  expenses: 'Dépenses',
  basic_reports: 'Rapports simples',
  receipts: 'Reçus personnalisés',
  customers_suppliers: 'Clients et fournisseurs',
  advanced_reports: 'Rapports avancés',
  pdf_export: 'Export PDF',
  excel_export: 'Export Excel',
  multi_business: 'Multi-entreprises',
  multi_store: 'Multi-boutiques',
  offline_mode: 'Mode hors ligne',
  inventory_count: 'Inventaires physiques',
  transfers: 'Transferts entre boutiques',
  advanced_permissions: 'Permissions avancées',
  notifications: 'Notifications avancées',
  expense_approval: 'Approbation des dépenses',
  consolidated_reports: 'Rapports multi-entreprises',
  audit_log: 'Journal d’audit avancé',
  priority_support: 'Support prioritaire',
  trial_14_days: '14 jours d’essai gratuit',
  orange_money_payments: 'Paiement Orange Money',
  stripe_payments: 'Paiement par carte avec Stripe',
  desktop_web: 'Accès Web optimisé pour ordinateur',
  low_stock_alerts: 'Alertes de stock faible',
  customer_debt: 'Dettes clients',
  supplier_debt: 'Dettes fournisseurs',
  advanced_cash_closure: 'Clôture de caisse avancée',
};

export default function SubscriptionScreen() {
  const theme = useTheme();
  const { membership, businesses } = useAuth();
  const { subscription, plans, isLoading, error, refreshSubscription } = useSubscription();
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [pendingDowngrade, setPendingDowngrade] = useState<{ planId: string; cycle: BillingCycle } | null>(null);
  const [keepCompanyId, setKeepCompanyId] = useState<string | null>(membership?.companyId ?? null);
  const statusLabels:Record<string,string>={trialing:'Essai gratuit',active:'Actif',past_due:'Période de grâce',expired:'Expiré',canceled:'Annulé',cancelled:'Annulé',pending:'Paiement en attente',suspended:'Suspendu'};

  const choosePlan = (planId: string, targetCycle: BillingCycle) => {
    const targetPlan = plans.find((item) => item.id === planId);
    if (!targetPlan || membership?.role !== 'company_admin') return;
    const currentLimit = subscription?.maxBusinesses ?? targetPlan.maxBusinesses;
    const requiresCompanyChoice = !!subscription && targetPlan.maxBusinesses < currentLimit && businesses.length > 1;
    if (requiresCompanyChoice) {
      setKeepCompanyId(membership.companyId ?? businesses[0]?.companyId ?? null);
      setPendingDowngrade({ planId, cycle: targetCycle });
      return;
    }
    router.push({ pathname: '/(subscription)/payment' as never, params: { planId, cycle: targetCycle } });
  };

  const proceedWithDowngrade = () => {
    if (!pendingDowngrade || !keepCompanyId) return;
    router.push({
      pathname: '/(subscription)/payment' as never,
      params: { planId: pendingDowngrade.planId, cycle: pendingDowngrade.cycle, keepCompanyId },
    });
    setPendingDowngrade(null);
  };

  if (isLoading) return <LoadingScreen label="Chargement des forfaits…" />;
  if (error) return <ErrorState message={error.message} onRetry={() => void refreshSubscription()} />;

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header>
        <AppBackButton fallback="/" />
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
              subtitle={`Statut : ${statusLabels[subscription.status??''] ?? subscription.status ?? 'inconnu'}`}
              right={() => <Chip style={styles.chip}>{subscription.isReadOnly ? 'Lecture seule' : 'Actif'}</Chip>}
            />
            <Card.Content>
              <Text>
                Expiration : {subscription.expiresAt
                  ? formatDate(subscription.expiresAt)
                  : 'non définie'}
              </Text>
              {subscription.expiresAt&&<Text>{Math.max(0,Math.ceil((new Date(subscription.expiresAt).getTime()-Date.now())/86400000))} jour(s) restant(s)</Text>}
              {subscription.status==='trialing'&&<Text style={styles.bold}>Essai gratuit en cours · aucune carte bancaire requise pour cet essai</Text>}
              {subscription.status==='past_due'&&<Text style={{color:'#C92A2A'}}>Paiement en retard. Renouvelez avant la fin de la période de grâce.</Text>}
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
                      onPress={() => choosePlan(plan.id, cycle)}
                    >
                      {active ? 'Renouveler' : 'Choisir ce forfait'}
                    </AppButton>
                  )}
                </Card.Content>
              </Card>
            );
          })}
        </View>
        {!plans.length && (
          <Card mode="outlined">
            <Card.Content style={styles.emptyPlans}>
              <Text variant="titleMedium" style={styles.bold}>Aucun forfait disponible</Text>
              <Text>Vérifiez votre connexion puis rechargez le catalogue.</Text>
              <AppButton mode="outlined" icon="refresh" onPress={() => void refreshSubscription()}>Réessayer</AppButton>
            </Card.Content>
          </Card>
        )}
        {membership?.role === 'employee' && (
          <Text style={styles.center}>
            Seul le propriétaire peut acheter ou modifier le forfait. Contactez votre administrateur.
          </Text>
        )}
      </ScrollView>
      <Portal>
        <Dialog visible={!!pendingDowngrade} onDismiss={() => setPendingDowngrade(null)}>
          <Dialog.Title>Choisir l’entreprise à conserver</Dialog.Title>
          <Dialog.Content style={styles.dialogContent}>
            <Text>
              Ce forfait limite le nombre d’entreprises autorisées. Choisissez celle à conserver pour continuer.
            </Text>
            {businesses.map((business) => (
              <Card
                key={business.companyId}
                mode={keepCompanyId === business.companyId ? 'contained' : 'outlined'}
                onPress={() => setKeepCompanyId(business.companyId)}
                style={styles.businessCard}
              >
                <Card.Content>
                  <Text style={styles.bold}>{business.companyName}</Text>
                  <Text>{business.roleName}</Text>
                </Card.Content>
              </Card>
            ))}
          </Dialog.Content>
          <Dialog.Actions>
            <AppButton mode="text" onPress={() => setPendingDowngrade(null)}>Annuler</AppButton>
            <AppButton disabled={!keepCompanyId} onPress={proceedWithDowngrade}>Continuer</AppButton>
          </Dialog.Actions>
        </Dialog>
      </Portal>
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
  emptyPlans: { gap: 10, alignItems: 'flex-start' },
  dialogContent: { gap: 12 },
  businessCard: { borderRadius: 14 },
});
