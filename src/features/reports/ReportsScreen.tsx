import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Chip, HelperText, Icon, ProgressBar, SegmentedButtons, Text, TextInput, useTheme } from 'react-native-paper';
import { SelectField, type SelectOption } from '@/components/forms/SelectField';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { useAuth } from '@/features/auth/AuthProvider';
import { PermissionGuard } from '@/features/auth/PermissionGuard';
import type { ReportFilterOption, ReportMetricRow } from '@/types/database';
import { getBusinessReport, getCashBalance, getFinancialDetails, getReportFilters } from './api';
import { exportFinancialPdf } from './export';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import { useSubscription } from '@/features/subscriptions/SubscriptionProvider';
import { useReceiptBranding } from '@/features/payments/branding';
import { FeatureGate } from '@/components/subscriptions/FeatureGate';

type Preset = 'today' | 'week' | 'month' | 'year' | 'custom';
type ReportView = 'global' | 'sales' | 'expenses';
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
function range(preset: Preset) {
  const now = new Date();
  const start = new Date(now);
  if (preset === 'week') start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  if (preset === 'month') start.setDate(1);
  if (preset === 'year') { start.setMonth(0); start.setDate(1); }
  return { start: iso(start), end: iso(now) };
}
const options = (items: ReportFilterOption[], all: string): SelectOption[] => [{ label: all, value: null }, ...items.map((item) => ({ label: item.name, value: item.id }))];
const paymentLabels: Record<string, string> = { cash: 'Espèces', card: 'Carte', mobile_money: 'Mobile Money', bank_transfer: 'Virement', mixed: 'Mixte', unknown: 'Non précisé' };
function variation(current: number, previous: number) {
  if (previous === 0) return current === 0 ? '0 %' : 'Nouveau';
  const result = ((current - previous) / Math.abs(previous)) * 100;
  return `${result >= 0 ? '+' : ''}${result.toFixed(1)} %`;
}

function MetricCard({ label, value, icon, color }: { label: string; value: string; icon: string; color: string }) {
  const theme = useTheme();
  return <Card mode="contained" style={[styles.metricCard, { backgroundColor: theme.colors.surface }]}><Card.Content style={styles.metricContent}><View style={[styles.metricIcon, { backgroundColor: `${color}1F` }]}><Icon source={icon} size={24} color={color} /></View><Text style={{ color: theme.colors.onSurfaceVariant }}>{label}</Text><Text variant="titleLarge" style={styles.bold}>{value}</Text></Card.Content></Card>;
}

function Ranking({ title, rows, valueKey = 'gross_profit' }: { title: string; rows: ReportMetricRow[]; valueKey?: 'gross_profit' | 'amount' | 'revenue' }) {
  const { formatMoney: money } = useCurrency();
  const max = Math.max(...rows.map((row) => Number(row[valueKey] ?? 0)), 1);
  return <Card mode="outlined" style={styles.rankingCard}><Card.Title title={title} titleNumberOfLines={2} /><Card.Content style={styles.list}>{rows.length ? rows.map((row, index) => { const value = Number(row[valueKey] ?? 0); return <View key={`${row.id ?? row.name}-${index}`} style={styles.rank}><View style={styles.row}><Text style={styles.rankingLabel} numberOfLines={2}>{index + 1}. {paymentLabels[row.name] ?? row.name}</Text><Text variant="titleSmall" numberOfLines={1} style={styles.rankingAmount}>{money(value)}</Text></View><ProgressBar progress={Math.max(0, value / max)} style={styles.progress} />{row.quantity !== undefined && <Text variant="bodySmall" style={styles.rankingDetail}>{row.quantity} unité(s) · CA {money(Number(row.revenue ?? 0))}</Text>}</View>; }) : <Text>Aucune donnée sur cette période.</Text>}</Card.Content></Card>;
}

export default function ReportsScreen() {
  const { formatMoney: money, primaryCode } = useCurrency();
  const reportBranding=useReceiptBranding();
  const { membership, session } = useAuth();
  const employee = membership?.role === 'employee';
  const { canUseFeature } = useSubscription();
  const advancedReports = canUseFeature('advanced_reports');
  const theme = useTheme();
  const company = membership?.companyId ?? '';
  const initial = range('month');
  const [preset, setPreset] = useState<Preset>('month');
  const [view, setView] = useState<ReportView>('global');
  const [startDate, setStartDate] = useState(initial.start);
  const [endDate, setEndDate] = useState(initial.end);
  const storeId = membership?.storeId ?? null;
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const dates = useMemo(() => preset === 'custom' ? { start: startDate, end: endDate } : range(preset), [preset, startDate, endDate]);
  const validDates = /^\d{4}-\d{2}-\d{2}$/.test(dates.start) && /^\d{4}-\d{2}-\d{2}$/.test(dates.end) && dates.start <= dates.end;
  const filters = useQuery({ queryKey: ['report-filters', company, storeId], queryFn: () => getReportFilters(storeId!), enabled: !!company && !!storeId });
  const report = useQuery({ queryKey: ['business-report', company, dates.start, dates.end, storeId, employeeId, productId, categoryId], queryFn: () => getBusinessReport({ startDate: dates.start, endDate: dates.end, storeId, employeeId, productId, categoryId }), enabled: !!company && validDates });
  const canReadCash = membership?.role === 'company_admin' || membership?.permissions.some((permission) => ['cash_transactions.read', 'expenses.read'].includes(permission));
  const cash = useQuery({ queryKey: ['report-cash-balance', company, storeId], queryFn: () => getCashBalance(company,storeId), enabled: !!company && !employee && canReadCash });
  const details = useQuery({ queryKey: ['report-financial-details', company, dates.start, dates.end, storeId], queryFn: () => getFinancialDetails(company,dates.start,dates.end,storeId), enabled: !!company && !employee && validDates });
  const data = report.data;
  const cashBalance = cash.data ?? 0;
  const periodLabel = `${dates.start} au ${dates.end}`;
  const runExport = async () => {
    if (!data) return;
    if (!canUseFeature('pdf_export')) {
      setExportError('L’export PDF n’est pas inclus dans votre forfait.');
      return;
    }
    setExportError('');
    setExporting(true);
    try {
      const preparedBy = membership?.role === 'company_admin' ? 'Administrateur' : String(session?.user.user_metadata?.full_name ?? session?.user.email ?? 'Employé');
      const selectedEmployee=filters.data?.employees.find(item=>item.id===employeeId)?.name;
      const selectedProduct=filters.data?.products.find(item=>item.id===productId)?.name;
      const selectedCategory=filters.data?.categories.find(item=>item.id===categoryId)?.name;
      const scopeLabel=[membership?.storeName??'Toutes les boutiques',selectedEmployee&&`Employé : ${selectedEmployee}`,selectedProduct&&`Produit : ${selectedProduct}`,selectedCategory&&`Catégorie : ${selectedCategory}`].filter(Boolean).join(' • ');
      const context = { report: data, companyName: reportBranding.company, storeName:reportBranding.store, currencyCode: primaryCode, periodLabel, cashBalance, details: details.data ?? { sales: [], expenses: [], cash: [] }, preparedBy, scopeLabel, address:reportBranding.address,phone:reportBranding.phone,email:reportBranding.email,logoUrl:reportBranding.logoUrl,footer:reportBranding.footer,accentColor:reportBranding.accentColor };
      await exportFinancialPdf(context);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Impossible de générer le fichier.');
    } finally {
      setExporting(false);
    }
  };
  const periodCards = [
    ['today', 'Rapport journalier', 'calendar-today', '#1971C2'],
    ['month', 'Rapport mensuel', 'calendar-month-outline', '#7048E8'],
    ['year', 'Rapport annuel', 'calendar-range', '#084B50'],
  ] as const;

  if (employee) {
    return (
      <PermissionGuard permission={['daily_reports.read', 'monthly_reports.read']}>
        <AdminPage title="Rapport des ventes">
          {(report.isLoading || filters.isLoading) && <LoadingScreen label="Calcul du rapport…" />}
          {!!report.error && <HelperText type="error" visible>{report.error.message}</HelperText>}
          {data && (
            <View style={styles.metricGrid}>
              <MetricCard label="Total des ventes" value={money(data.revenue)} icon="cart-check" color="#1971C2" />
              <MetricCard label="Quantité vendue" value={data.quantitySold.toLocaleString('fr-FR')} icon="counter" color="#7048E8" />
              <MetricCard label="Nombre de ventes" value={String(data.saleCount)} icon="receipt-text-outline" color="#084B50" />
            </View>
          )}
          {data && !data.saleCount && (
            <EmptyState icon="chart-line" title="Aucune vente" message="Aucune vente enregistrée sur cette période." />
          )}
        </AdminPage>
      </PermissionGuard>
    );
  }

  return (
    <PermissionGuard permission={['daily_reports.read', 'monthly_reports.read']}>
      <AdminPage title="Bilan des activités">
        <View style={styles.periodGrid}>
          {periodCards.map(([value, label, icon, color]) => <Card key={value} mode={preset === value ? 'contained' : 'outlined'} onPress={() => setPreset(value)} style={[styles.periodCard, preset === value && { backgroundColor: `${color}20`, borderColor: color }]}><Card.Content style={styles.periodContent}><Icon source={icon} size={27} color={color} /><Text variant="titleMedium" style={[styles.bold, { color }]}>{label}</Text>{preset === value && <Icon source="check-circle" size={21} color={color} />}</Card.Content></Card>)}
        </View>
        <Card mode="contained" style={{ backgroundColor: theme.colors.surface }}>
          <Card.Content style={styles.filters}>
            <View style={styles.chips}><Chip selected={preset === 'week'} onPress={() => setPreset('week')}>Cette semaine</Chip><Chip selected={preset === 'custom'} onPress={() => setPreset('custom')}>Période personnalisée</Chip></View>
            {preset === 'custom' && <View style={styles.grid}><TextInput style={styles.field} mode="outlined" label="Début (AAAA-MM-JJ)" value={startDate} onChangeText={setStartDate} /><TextInput style={styles.field} mode="outlined" label="Fin (AAAA-MM-JJ)" value={endDate} onChangeText={setEndDate} /></View>}
            {!validDates && <HelperText type="error" visible>Entrez une période valide au format AAAA-MM-JJ.</HelperText>}
            {advancedReports && <View style={styles.grid}><View style={styles.field}><SelectField label="Employé" value={employeeId} options={options(filters.data?.employees ?? [], 'Tous les employés')} onChange={setEmployeeId} /></View><View style={styles.field}><SelectField label="Produit" value={productId} options={options(filters.data?.products ?? [], 'Tous les produits')} onChange={setProductId} /></View><View style={styles.field}><SelectField label="Catégorie" value={categoryId} options={options(filters.data?.categories ?? [], 'Toutes les catégories')} onChange={setCategoryId} /></View></View>}
          </Card.Content>
        </Card>
        {advancedReports ? <SegmentedButtons value={view} onValueChange={(value) => setView(value as ReportView)} buttons={[{ value: 'global', label: 'Global', icon: 'view-dashboard-outline' }, { value: 'sales', label: 'Ventes', icon: 'cart-outline' }, { value: 'expenses', label: 'Dépenses', icon: 'cash-minus' }]} /> : <FeatureGate feature="advanced_reports" label="Rapports détaillés" />}
        {data && <FeatureGate feature="pdf_export" label="Export PDF des rapports"><Card mode="contained" style={{ backgroundColor: theme.colors.surface }}><Card.Content style={styles.exportRow}><View style={styles.grow}><Text variant="titleMedium" style={styles.bold}>Exporter le rapport détaillé</Text><Text style={{ color: theme.colors.onSurfaceVariant }}>Document PDF personnalisé, prêt à imprimer ou partager.</Text></View><AppButton mode="outlined" icon="file-pdf-box" loading={exporting} disabled={exporting} onPress={() => void runExport()}>Générer le PDF</AppButton></Card.Content></Card></FeatureGate>}
        {!!exportError && <HelperText type="error" visible>{exportError}</HelperText>}
        {(report.isLoading || filters.isLoading) && <LoadingScreen label="Calcul du rapport…" />}
        {!!filters.error && <HelperText type="error" visible>{filters.error.message}</HelperText>}
        {!!report.error && <HelperText type="error" visible>{report.error.message}</HelperText>}
        {data && !advancedReports && <View style={styles.metricGrid}><MetricCard label="Total des ventes" value={money(data.revenue)} icon="cart-check" color="#1971C2" /><MetricCard label="Nombre de ventes" value={String(data.saleCount)} icon="receipt-text-outline" color="#084B50" /><MetricCard label="Quantité vendue" value={data.quantitySold.toLocaleString('fr-FR')} icon="counter" color="#7048E8" /><MetricCard label="Dépenses" value={money(data.expenses)} icon="cash-minus" color="#C92A2A" /></View>}
        {data && advancedReports && view === 'global' && <><View style={styles.metricGrid}><MetricCard label="Revenus" value={money(data.revenue)} icon="cash-multiple" color="#1971C2" /><MetricCard label="Bénéfice brut" value={money(data.grossProfit)} icon="trending-up" color="#084B50" /><MetricCard label="Dépenses" value={money(data.expenses)} icon="cash-minus" color="#C92A2A" /><MetricCard label="Bénéfice net" value={money(data.netProfit)} icon="chart-line" color={data.netProfit >= 0 ? '#084B50' : '#C92A2A'} /><MetricCard label="Valeur du stock" value={money(data.stockValue)} icon="warehouse" color="#E67700" /><MetricCard label="Solde de caisse" value={money(cashBalance)} icon="wallet-outline" color="#7048E8" /><MetricCard label="Valeur de la boutique" value={money(data.stockValue + cashBalance)} icon="store-check-outline" color="#084B50" /></View><Card mode="contained" style={{ backgroundColor: data.netProfit >= 0 ? theme.colors.primaryContainer : theme.colors.errorContainer }}><Card.Content style={styles.netProfit}><Icon source={data.netProfit >= 0 ? 'arrow-up-circle' : 'arrow-down-circle'} size={34} color={data.netProfit >= 0 ? theme.colors.primary : theme.colors.error} /><View><Text>Bénéfice net de la période</Text><Text variant="headlineMedium" style={styles.bold}>{money(data.netProfit)}</Text></View><Chip>{variation(data.netProfit, data.previous.netProfit)}</Chip></Card.Content></Card><Card mode="outlined"><Card.Content><Text style={{ color: theme.colors.onSurfaceVariant }}>Valeur de la boutique = valeur d’achat du stock restant + solde de caisse. Il s’agit d’un indicateur opérationnel, pas d’une valorisation commerciale de l’entreprise.</Text></Card.Content></Card><View style={styles.twoColumns}><Ranking title="Produits les plus rentables" rows={data.topProducts} /><Ranking title="Performance des boutiques" rows={data.stores} valueKey="revenue" /></View></>}
        {data && advancedReports && view === 'sales' && <><View style={styles.metricGrid}><MetricCard label="Total des ventes" value={money(data.revenue)} icon="cart-check" color="#1971C2" /><MetricCard label="Coût des marchandises" value={money(data.costOfGoods)} icon="package-variant" color="#E67700" /><MetricCard label="Quantité vendue" value={data.quantitySold.toLocaleString('fr-FR')} icon="counter" color="#7048E8" /><MetricCard label="Nombre de ventes" value={String(data.saleCount)} icon="receipt-text-outline" color="#084B50" /></View><View style={styles.twoColumns}><Ranking title="Moyens de paiement" rows={data.paymentMethods} valueKey="amount" /><Ranking title="Performance des employés" rows={data.employees} valueKey="revenue" /></View></>}
        {data && advancedReports && view === 'expenses' && <><View style={styles.metricGrid}><MetricCard label="Dépenses totales" value={money(data.expenses)} icon="cash-minus" color="#C92A2A" /><MetricCard label="Valeur du stock" value={money(data.stockValue)} icon="warehouse" color="#E67700" /><MetricCard label="Marge après dépenses" value={money(data.netProfit)} icon="scale-balance" color={data.netProfit >= 0 ? '#084B50' : '#C92A2A'} /></View><Card mode="outlined"><Card.Content style={styles.netProfit}><Icon source="information-outline" size={28} color={theme.colors.secondary} /><Text style={styles.grow}>Le bénéfice net correspond au bénéfice brut diminué de toutes les dépenses enregistrées sur la période.</Text></Card.Content></Card></>}
        {data && !data.saleCount && <EmptyState icon="chart-line" title="Aucune vente" message="Modifiez la période ou les filtres pour afficher un rapport." />}
      </AdminPage>
    </PermissionGuard>
  );
}

const styles = StyleSheet.create({
  bold: { fontWeight: '800' },
  periodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  periodCard: { flexGrow: 1, flexBasis: 230, borderRadius: 20 },
  periodContent: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  filters: { gap: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  field: { flexGrow: 1, flexBasis: 200 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metricCard: { flexGrow: 1, flexBasis: 190, borderRadius: 20 },
  metricContent: { gap: 7 },
  metricIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  netProfit: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14 },
  exportRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  twoColumns: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  rankingCard: { flexGrow: 1, flexBasis: 360, minWidth: 0 },
  list: { gap: 18, paddingBottom: 18 },
  rank: { minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grow: { flex: 1, minWidth: 0 },
  rankingLabel: { flex: 1, minWidth: 0, lineHeight: 21 },
  rankingAmount: { flexShrink: 0, maxWidth: '48%', textAlign: 'right' },
  rankingDetail: { marginTop: 7, lineHeight: 18 },
  progress: { height: 7, borderRadius: 4, marginTop: 8 },
});
