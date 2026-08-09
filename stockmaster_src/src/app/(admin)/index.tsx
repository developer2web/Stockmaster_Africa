import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Appbar, Card, Chip, Icon, Menu, Text, useTheme } from 'react-native-paper';
import { AppButton } from '@/components/ui/AppButton';
import { useAuth } from '@/features/auth/AuthProvider';
import { getAdminOverview } from '@/features/dashboard/api';
import { getBusinessReport } from '@/features/reports/api';
import { useCurrency } from '@/features/currency/CurrencyProvider';
const iso = (date: Date) => date.toISOString().slice(0, 10);

const primaryModules = [
  ['cart-plus', 'Ventes', 'Nouvelle vente et historique', '/sales', '#087F5B'],
  ['warehouse', 'Inventaire', 'Quantités et valeur du stock', '/stock', '#1971C2'],
  ['wallet-outline', 'Caisse', 'Solde, entrées et dépenses', '/cash', '#E67700'],
  ['chart-box-outline', 'Rapports', 'Bilans et bénéfices', '/reports', '#7048E8'],
] as const;

const managementModules = [
  ['barcode-scan', 'Scanner', '/scanner'],
  ['package-variant-closed', 'Produits', '/products'],
  ['shape-outline', 'Catégories', '/categories'],
  ['truck-outline', 'Fournisseurs', '/suppliers'],
  ['store-cog-outline', 'Boutiques', '/stores'],
  ['account-group-outline', 'Employés', '/employees'],
  ['shield-account-outline', 'Rôles', '/roles'],
  ['office-building-cog-outline', 'Entreprise', '/company'],
  ['credit-card-refresh-outline', 'Abonnement', '/(subscription)'],
] as const;

export default function AdminDashboard() {
  const { formatMoney: money } = useCurrency();
  const { membership, businesses, stores, signOut } = useAuth();
  const { width } = useWindowDimensions();
  const theme = useTheme();
  const companyId = membership?.companyId ?? '';
  const storeId = membership?.storeId ?? '';
  const overview = useQuery({ queryKey: ['admin-overview', companyId, storeId], queryFn: () => getAdminOverview(companyId,storeId), enabled: !!companyId&&!!storeId });
  const today = iso(new Date());
  const report = useQuery({
    queryKey: ['dashboard-report', companyId, today],
    queryFn: () => getBusinessReport({ startDate: today, endDate: today, storeId, employeeId: null, productId: null, categoryId: null }),
    enabled: !!companyId&&!!storeId,
  });
  const compact = width < 620;
  const [managementOpen, setManagementOpen] = useState(false);

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header elevated style={[styles.appHeader, { backgroundColor: theme.colors.surface }]}>
        <Menu
          visible={managementOpen}
          onDismiss={() => setManagementOpen(false)}
          contentStyle={styles.managementMenu}
          anchor={<Appbar.Action icon="menu" accessibilityLabel="Ouvrir le menu de gestion" onPress={() => setManagementOpen(true)} />}
        >
          <ScrollView style={styles.managementMenuScroll}>
            {managementModules.map(([icon, title, path]) => (
              <Menu.Item key={path} leadingIcon={icon} title={title} onPress={() => { setManagementOpen(false); router.push(path as never); }} />
            ))}
          </ScrollView>
        </Menu>
        <Appbar.Content
          title={membership?.companyName ?? 'StockMaster'}
          titleStyle={styles.headerCompanyName}
          subtitle={`Boutique active : ${membership?.storeName ?? 'Non sélectionnée'}`}
        />
        {(businesses.length > 1 || stores.length > 1) && <Appbar.Action icon="swap-horizontal" accessibilityLabel="Changer d’espace" onPress={() => router.push('/choose-business')} />}
        <Appbar.Action icon="logout" onPress={signOut} />
      </Appbar.Header>
      <ScrollView contentContainerStyle={[styles.page, compact && styles.pageCompact]} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, compact && styles.compactHero, { backgroundColor: '#087F5B' }]}>
          <View style={styles.heroTop}><View style={styles.grow}><Text variant="headlineSmall" style={styles.heroTitle}>Pilotez votre activité</Text><Text style={styles.heroText}>Une vue claire de votre entreprise, en temps réel.</Text></View><Chip icon="check-decagram">{membership?.subscriptionStatus ?? 'actif'}</Chip></View>
          <View style={styles.heroStats}>
            <View><Text style={styles.heroLabel}>Articles en stock</Text><Text variant="titleLarge" style={styles.heroTitle}>{(overview.data?.stockQuantity ?? 0).toLocaleString('fr-FR')}</Text></View>
            <View><Text style={styles.heroLabel}>Ventes aujourd’hui</Text><Text variant="titleLarge" style={styles.heroTitle}>{money(report.data?.revenue ?? 0)}</Text></View>
            <View><Text style={styles.heroLabel}>Bénéfice du jour</Text><Text variant="titleLarge" style={styles.heroTitle}>{money(report.data?.netProfit ?? 0)}</Text></View>
          </View>
        </View>

        <Text variant="titleLarge" style={styles.bold}>Accès rapide</Text>
        <View style={styles.primaryGrid}>
          {primaryModules.map(([icon, title, subtitle, path, color]) => (
            <Card key={path} mode="contained" onPress={() => router.push(path as never)} style={[styles.primaryCard, { backgroundColor: theme.colors.surface }, compact && styles.full]}>
              <Card.Content style={styles.primaryContent}>
                <View style={[styles.moduleIcon, { backgroundColor: `${color}1F` }]}><Icon source={icon} size={34} color={color} /></View>
                <Text variant="titleLarge" style={styles.bold}>{title}</Text>
                <Text style={[styles.center, { color: theme.colors.onSurfaceVariant }]}>{subtitle}</Text>
              </Card.Content>
            </Card>
          ))}
        </View>

        <Card mode="contained" style={{ backgroundColor: theme.colors.surface }}>
          <Card.Title title="Aperçu de l’inventaire" subtitle={`${overview.data?.products ?? 0} produits actifs`} />
          <Card.Content style={styles.inventoryStats}>
            <View style={styles.grow}><Text style={{ color: theme.colors.onSurfaceVariant }}>Valeur d’achat</Text><Text variant="titleLarge" style={styles.bold}>{money(overview.data?.purchaseValue ?? 0)}</Text></View>
            <View style={styles.grow}><Text style={{ color: theme.colors.onSurfaceVariant }}>Valeur de vente du stock</Text><Text variant="titleLarge" style={[styles.bold, { color: theme.colors.primary }]}>{money(overview.data?.expectedRevenue ?? 0)}</Text></View>
            <AppButton mode="outlined" icon="arrow-right" contentStyle={styles.reverse} onPress={() => router.push('/stock' as never)}>Voir le stock</AppButton>
          </Card.Content>
        </Card>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  appHeader: { paddingHorizontal: 0 },
  page: { width: '100%', maxWidth: 1120, alignSelf: 'center', padding: 22, paddingBottom: 44, gap: 20 },
  pageCompact: { padding: 15 },
  hero: { padding: 24, borderRadius: 28, gap: 22 },
  compactHero: { padding: 18, borderRadius: 22, gap: 18 },
  heroTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  heroTitle: { color: '#FFFFFF', fontWeight: '800' },
  heroText: { color: 'rgba(255,255,255,0.80)' },
  heroLabel: { color: 'rgba(255,255,255,0.72)' },
  heroStats: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 18 },
  grow: { flex: 1, minWidth: 150 },
  bold: { fontWeight: '800' },
  primaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  primaryCard: { flexGrow: 1, flexBasis: '22%', minWidth: 200, borderRadius: 24 },
  full: { flexBasis: '100%', minWidth: 0 },
  primaryContent: { alignItems: 'center', gap: 9, paddingVertical: 20 },
  moduleIcon: { width: 68, height: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
  inventoryStats: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 18 },
  headerCompanyName: { fontWeight: '800', flexShrink: 1 },
  managementMenu: { minWidth: 260 },
  managementMenuScroll: { maxHeight: 430 },
  reverse: { flexDirection: 'row-reverse' },
});
