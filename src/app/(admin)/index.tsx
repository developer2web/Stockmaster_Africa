import { localDateValue } from '@/utils/calendar';
import { getSales } from '@/features/sales/api';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Card, Text, useTheme } from 'react-native-paper';
import { AppButton } from '@/components/ui/AppButton';
import { useAuth } from '@/features/auth/AuthProvider';
import { getAdminOverview } from '@/features/dashboard/api';
import { getBusinessReport } from '@/features/reports/api';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import { getCashSummary } from '@/features/cash/api';
import { NotificationBell } from '@/components/notifications/NotificationBell';

export default function AdminDashboard() {
  const { formatMoney: money } = useCurrency();
  const { membership, businesses, stores } = useAuth();
  const theme = useTheme();
  const companyId = membership?.companyId ?? '';
  const storeId = membership?.storeId ?? '';
  const enabled = !!companyId && !!storeId;
  const today = localDateValue();
  const overview = useQuery({ queryKey: ['admin-overview', companyId, storeId], queryFn: () => getAdminOverview(companyId, storeId), enabled });
  const cash = useQuery({ queryKey: ['cash-summary', companyId, storeId], queryFn: () => getCashSummary(storeId), enabled });
  const report = useQuery({
    queryKey: ['dashboard-report', companyId, storeId, today],
    queryFn: () => getBusinessReport({ startDate: today, endDate: today, storeId, employeeId: null, productId: null, categoryId: null }),
    enabled,
  });
  const firstSales = useQuery({ queryKey: ['dashboard-first-sale', companyId, storeId], queryFn: () => getSales(companyId, storeId, 0, false), enabled });
  const refetchFirstSales = firstSales.refetch;
  const scrollRef = useRef<ScrollView>(null);
  useFocusEffect(useCallback(() => { scrollRef.current?.scrollTo({ y: 0, animated: false }); if (enabled) void refetchFirstSales(); }, [enabled, refetchFirstSales]));
  const hasError = !!(overview.error || cash.error || report.error);
  const showGettingStarted = !overview.error && !!overview.data && !firstSales.isLoading && !firstSales.error && firstSales.data?.length === 0;
  const hasProducts = (overview.data?.products ?? 0) > 0;
  const hasStock = (overview.data?.stockQuantity ?? 0) > 0;
  const lowStock = overview.data?.lowStockProducts ?? 0;
  const credit = overview.data?.outstandingCredit ?? 0;

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header elevated style={{ backgroundColor: theme.colors.surface }}>
        <Appbar.Content title={membership?.companyName ?? 'StockMaster'} />
        {(businesses.length > 1 || stores.length > 1) && <Appbar.Action icon="swap-horizontal" accessibilityLabel="Changer de boutique" onPress={() => router.push(businesses.length > 1 ? '/choose-business' : '/choose-store')} />}
        <NotificationBell />
      </Appbar.Header>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.page}>
        <View style={styles.intro}>
          <Text variant="headlineSmall" style={styles.bold}>Votre boutique aujourd’hui</Text>
          <Text style={{ color: theme.colors.onSurfaceVariant }}>{membership?.storeName ?? 'Sélectionnez une boutique'}</Text>
        </View>
        <AppButton icon="cart-plus" disabled={!enabled} onPress={() => router.push('/sales/new')}>Nouvelle vente</AppButton>
        {showGettingStarted && <Card mode="outlined"><Card.Content style={styles.intro}>
          <Text variant="titleMedium">Votre première vente, en trois étapes</Text>
          <Text>{hasProducts ? '✓' : '1.'} Ajouter un produit</Text>
          {!hasProducts && <AppButton mode="outlined" icon="plus" onPress={() => router.push('/products/new')}>Ajouter mon premier produit</AppButton>}
          <Text>{hasStock ? '✓' : '2.'} Renseigner les quantités disponibles</Text>
          {hasProducts && !hasStock && <><Text>Ouvrez un produit pour indiquer son stock réel.</Text><AppButton mode="outlined" icon="package-variant" onPress={() => router.push('/products')}>Renseigner le stock</AppButton></>}
          <Text>3. Enregistrer une première vente</Text>
          {hasProducts && hasStock && <Text>Votre catalogue est prêt. Utilisez Nouvelle vente pour commencer.</Text>}
          <Text variant="bodySmall">Ce guide disparaît après votre première vente confirmée.</Text>
        </Card.Content></Card>}
        <View style={styles.metrics}>
          <Metric title="Ventes du jour" value={report.error ? 'Indisponible' : report.data ? money(report.data.revenue) : '…'} hint="Montant des ventes, crédits compris" onPress={() => router.push('/sales')} />
          <Metric title="Solde de caisse" value={cash.error ? 'Indisponible' : cash.data ? money(cash.data.balance) : '…'} hint="Entrées moins sorties enregistrées" onPress={() => router.push('/cash')} />
          <Metric title="À réapprovisionner" value={overview.error ? 'Indisponible' : overview.data ? String(lowStock) : '…'} hint="Produits dont le stock est faible" onPress={() => router.push('/stock')} />
        </View>
        {hasError && <Card mode="outlined"><Card.Content style={styles.intro}>
          <Text>Certains indicateurs ne sont pas disponibles. Vous pouvez continuer à utiliser les outils de la boutique.</Text>
          <AppButton mode="text" onPress={() => { void Promise.all([overview.refetch(), cash.refetch(), report.refetch()]); }}>Actualiser les indicateurs</AppButton>
        </Card.Content></Card>}
        {!overview.error && (lowStock > 0 || credit > 0) && <Card mode="outlined"><Card.Content style={styles.intro}>
          <Text variant="titleMedium" style={styles.bold}>À suivre</Text>
          {lowStock > 0 && <AppButton mode="text" icon="package-variant" onPress={() => router.push('/stock')}>Voir les stocks à vérifier ({lowStock})</AppButton>}
          {credit > 0 && <AppButton mode="text" icon="account-cash-outline" onPress={() => router.push('/customers')}>Crédits clients : {money(credit)}</AppButton>}
        </Card.Content></Card>}
        <View style={styles.shortcuts}>
          <AppButton mode="outlined" icon="account-group-outline" onPress={() => router.push('/customers')}>Clients et crédits</AppButton>
          <AppButton mode="text" icon="chart-box-outline" onPress={() => router.push('/reports')}>Voir les rapports</AppButton>
          <AppButton mode="text" icon="magnify" onPress={() => router.push('/search')}>Rechercher</AppButton>
        </View>
      </ScrollView>
    </View>
  );
}

function Metric({ title, value, hint, onPress }: { title: string; value: string; hint: string; onPress: () => void }) {
  const theme = useTheme();
  return <Card mode="contained" style={[styles.metric, { backgroundColor: theme.colors.surface }]} onPress={onPress}>
    <Card.Content style={styles.intro}>
      <Text variant="titleSmall">{title}</Text>
      <Text variant="headlineSmall" style={styles.bold}>{value}</Text>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{hint}</Text>
    </Card.Content>
  </Card>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  page: { width: '100%', maxWidth: 1000, alignSelf: 'center', padding: 16, paddingBottom: 32, gap: 18 },
  intro: { gap: 8 },
  bold: { fontWeight: '800' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metric: { flexGrow: 1, flexBasis: 240, minWidth: 0 },
  shortcuts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
