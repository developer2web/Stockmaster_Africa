import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Appbar, Card, Chip, Icon, Text, useTheme } from 'react-native-paper';
import { AppButton } from '@/components/ui/AppButton';
import { ErrorState } from '@/components/ui/ErrorState';
import { useAuth } from '@/features/auth/AuthProvider';
import { getAdminOverview, getDashboardTrends } from '@/features/dashboard/api';
import { getBusinessReport } from '@/features/reports/api';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import { getCashSummary } from '@/features/cash/api';
const iso = (date: Date) => date.toISOString().slice(0, 10);

const primaryModules = [
  ['cart-plus', 'Ventes', 'Nouvelle vente et historique', '/sales', '#084B50'],
  ['warehouse', 'Inventaire', 'Quantités et valeur du stock', '/stock', '#1971C2'],
  ['wallet-outline', 'Caisse', 'Solde, entrées et dépenses', '/cash', '#E67700'],
  ['chart-box-outline', 'Rapports', 'Bilans et bénéfices', '/reports', '#7048E8'],
] as const;

export default function AdminDashboard() {
  const { formatMoney: money } = useCurrency();
  const { membership, businesses, stores, signOut } = useAuth();
  const { width } = useWindowDimensions();
  const theme = useTheme();
  const companyId = membership?.companyId ?? '';
  const storeId = membership?.storeId ?? '';
  const overview = useQuery({ queryKey: ['admin-overview', companyId, storeId], queryFn: () => getAdminOverview(companyId,storeId), enabled: !!companyId&&!!storeId });
  const trends = useQuery({ queryKey:['dashboard-trends',companyId,storeId],queryFn:()=>getDashboardTrends(companyId,storeId),enabled:!!companyId&&!!storeId });
  const cash = useQuery({ queryKey:['cash-summary',companyId,storeId],queryFn:()=>getCashSummary(storeId),enabled:!!companyId&&!!storeId });
  const today = iso(new Date());
  const report = useQuery({
    queryKey: ['dashboard-report', companyId, today],
    queryFn: () => getBusinessReport({ startDate: today, endDate: today, storeId, employeeId: null, productId: null, categoryId: null }),
    enabled: !!companyId&&!!storeId,
  });
  const compact = width < 620;

  if (overview.error) {
    const error = overview.error;
    return (
      <ErrorState
        title="Tableau de bord indisponible"
        message={error instanceof Error ? error.message : 'Impossible de charger les indicateurs.'}
        onRetry={() => void overview.refetch()}
        onCancel={() => void signOut()}
      />
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header elevated style={[styles.appHeader, { backgroundColor: theme.colors.surface }]}>
        <Appbar.Content
          title={membership?.companyName ?? 'StockMaster'}
          titleStyle={styles.headerCompanyName}
          subtitle={`Boutique active : ${membership?.storeName ?? 'Non sélectionnée'}`}
        />
        {(businesses.length > 1 || stores.length > 1) && <Appbar.Action icon="swap-horizontal" accessibilityLabel="Changer d’espace" onPress={() => router.push('/choose-business')} />}
        <Appbar.Action icon="logout" onPress={signOut} />
        <Appbar.Action icon="bell-outline" accessibilityLabel="Notifications" onPress={()=>router.push('/notifications' as never)} />
      </Appbar.Header>
      <ScrollView contentContainerStyle={[styles.page, compact && styles.pageCompact]} showsVerticalScrollIndicator={false}>
        {report.error && (
          <Card mode="outlined" style={{ borderColor: theme.colors.error }}>
            <Card.Content style={styles.reportWarning}>
              <Icon source="alert-circle-outline" size={24} color={theme.colors.error} />
              <View style={styles.grow}>
                <Text variant="titleMedium">Indicateurs de ventes indisponibles</Text>
                <Text style={{ color: theme.colors.onSurfaceVariant }}>L’inventaire reste accessible. Réessayez le rapport dans quelques instants.</Text>
              </View>
              <AppButton mode="text" onPress={() => void report.refetch()}>Réessayer</AppButton>
            </Card.Content>
          </Card>
        )}
        <View style={[styles.hero, compact && styles.compactHero, { backgroundColor: '#084B50' }]}>
          <View style={styles.heroTop}><View style={styles.grow}><Text variant="headlineSmall" style={styles.heroTitle}>Pilotez votre activité</Text><Text style={styles.heroText}>Une vue claire de votre entreprise, en temps réel.</Text></View><Chip icon="check-decagram">{membership?.subscriptionStatus ?? 'actif'}</Chip></View>
          <View style={styles.heroStats}>
            <View><Text style={styles.heroLabel}>Articles en stock</Text><Text variant="titleLarge" style={styles.heroTitle}>{(overview.data?.stockQuantity ?? 0).toLocaleString('fr-FR')}</Text></View>
            <View><Text style={styles.heroLabel}>Ventes aujourd’hui</Text><Text variant="titleLarge" style={styles.heroTitle}>{money(report.data?.revenue ?? 0)}</Text></View>
            <View><Text style={styles.heroLabel}>Bénéfice du jour</Text><Text variant="titleLarge" style={styles.heroTitle}>{money(report.data?.netProfit ?? 0)}</Text></View>
            <View><Text style={styles.heroLabel}>Solde de caisse</Text><Text variant="titleLarge" style={styles.heroTitle}>{money(cash.data?.balance ?? 0)}</Text></View>
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

        <View style={styles.secondaryGrid}>
          <Card mode="contained" onPress={() => router.push('/stock' as never)} style={[styles.secondaryCard, { backgroundColor: theme.colors.surface }]}>
            <Card.Title title="Stock faible" left={(props) => <Icon {...props} source="alert-outline" color="#C92A2A" />} />
            <Card.Content><Text variant="headlineMedium" style={styles.bold}>{overview.data?.lowStockProducts ?? 0}</Text><Text style={{ color: theme.colors.onSurfaceVariant }}>produit(s) à réapprovisionner</Text></Card.Content>
          </Card>
          <Card mode="contained" onPress={() => router.push('/customers' as never)} style={[styles.secondaryCard, { backgroundColor: theme.colors.surface }]}>
            <Card.Title title="Ardoise clients" left={(props) => <Icon {...props} source="account-cash-outline" color="#E67700" />} />
            <Card.Content><Text variant="headlineMedium" style={styles.bold}>{money(overview.data?.outstandingCredit ?? 0)}</Text><Text style={{ color: theme.colors.onSurfaceVariant }}>{overview.data?.customers ?? 0} client(s) actif(s)</Text></Card.Content>
          </Card>
        </View>

        <View style={styles.secondaryGrid}>
          <Card mode="contained" style={[styles.chartCard,{backgroundColor:theme.colors.surface}]}><Card.Title title="Ventes des 7 derniers jours" subtitle={compact ? 'Détail quotidien' : undefined}/>{compact ? <Card.Content style={styles.mobileTrends}>{trends.data?.days.map(day=>{const max=Math.max(...(trends.data?.days.map(item=>item.revenue)??[1]),1);const date=new Date(`${day.date}T12:00:00`);return <View key={day.date} style={styles.mobileTrendRow}><View style={styles.mobileTrendDate}><Text variant="labelLarge" style={styles.bold}>{date.toLocaleDateString('fr-FR',{weekday:'short'})}</Text><Text variant="bodySmall" style={{color:theme.colors.onSurfaceVariant}}>{date.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'})}</Text></View><View style={[styles.mobileTrack,{backgroundColor:theme.colors.surfaceVariant}]}><View style={[styles.mobileFill,{width:`${Math.max(day.revenue>0?6:0,(day.revenue/max)*100)}%`}]}/></View><Text variant="labelLarge" style={styles.mobileAmount}>{money(day.revenue)}</Text></View>})}</Card.Content> : <Card.Content style={styles.bars}>{trends.data?.days.map(day=>{const max=Math.max(...(trends.data?.days.map(item=>item.revenue)??[1]),1);return <View key={day.date} style={styles.barColumn}><Text variant="labelSmall">{money(day.revenue)}</Text><View style={[styles.bar,{height:Math.max(5,(day.revenue/max)*90)}]}/><Text variant="labelSmall">{new Date(`${day.date}T12:00:00`).toLocaleDateString('fr-FR',{weekday:'short'})}</Text></View>})}</Card.Content>}</Card>
          <Card mode="contained" style={[styles.topCard,{backgroundColor:theme.colors.surface}]}><Card.Title title="Top 5 produits vendus"/><Card.Content style={{gap:10}}>{trends.data?.topProducts.length?trends.data.topProducts.map((item,index)=><View key={item.name} style={styles.topRow}><Text style={styles.grow}>{index+1}. {item.name}</Text><Chip>{item.quantity.toLocaleString('fr-FR')}</Chip></View>):<Text>Aucune vente sur les 7 derniers jours.</Text>}</Card.Content></Card>
        </View>

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
  secondaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  secondaryCard: { flexGrow: 1, flexBasis: '46%', minWidth: 280, borderRadius: 20 },
  headerCompanyName: { fontWeight: '800', flexShrink: 1 },
  reverse: { flexDirection: 'row-reverse' },
  reportWarning: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  chartCard: { flexGrow:2,flexBasis:520,borderRadius:20 },
  topCard: { flexGrow:1,flexBasis:300,borderRadius:20 },
  bars: { minHeight:145,flexDirection:'row',alignItems:'flex-end',justifyContent:'space-around',gap:8 },
  barColumn: { flex:1,alignItems:'center',justifyContent:'flex-end',gap:5 },
  bar: { width:'70%',maxWidth:42,minHeight:5,backgroundColor:'#084B50',borderRadius:8 },
  mobileTrends: { gap: 12 },
  mobileTrendRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mobileTrendDate: { width: 42 },
  mobileTrack: { flex: 1, height: 8, borderRadius: 8, overflow: 'hidden' },
  mobileFill: { height: '100%', backgroundColor: '#084B50', borderRadius: 8 },
  mobileAmount: { width: 92, textAlign: 'right' },
  topRow: { flexDirection:'row',alignItems:'center',gap:8 },
});
