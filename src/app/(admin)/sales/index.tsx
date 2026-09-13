import { usePermissions } from '@/features/auth/usePermissions';
import { PendingSales } from '@/features/offline/PendingSales';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { Card, HelperText, Searchbar, Text, useTheme } from 'react-native-paper';

import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/features/auth/AuthProvider';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import { SALE_PAGE_SIZE } from '@/features/sales/api';
import { getHistoryFinancials } from '@/features/sales/historyFinancials';
import { getFilteredSales } from '@/features/sales/filteredHistory';
import { emptySalesFilters, paymentOptions, periodOptions, salesDateBounds, salesFilterCount, statusOptions, type SalesFilters } from '@/features/sales/filters';
import { DateField } from '@/components/forms/DateField';
import { SelectField } from '@/components/forms/SelectField';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { localDateValue } from '@/utils/calendar';
import { useSalesRealtime } from '@/hooks/useSalesRealtime';
import { AppFeedback } from '@/components/ui/AppFeedback';
import { formatDateTime } from '@/utils/format';

const paymentLabels: Record<string, string> = {
  cash: 'Espèces', card: 'Carte', mobile_money: 'Mobile Money',
  bank_transfer: 'Virement', mixed: 'Mixte',
};

export default function SalesScreen() {
  const can = usePermissions();
  const {notice}=useLocalSearchParams<{notice?:string}>();
  const [feedback,setFeedback]=useState(notice??'');
  const [search,setSearch]=useState('');
  const theme = useTheme();
  const [filters, setFilters] = useState<SalesFilters>(emptySalesFilters);
  const [draft, setDraft] = useState<SalesFilters>(emptySalesFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterError, setFilterError] = useState('');
  const searchTerm = useDebouncedValue(search.trim());
  const today = localDateValue();
  const bounds = salesDateBounds(filters);
  const criteria = { search: searchTerm, ...bounds, payment: filters.payment, status: filters.status };
  const filterCount = salesFilterCount(filters);
  const filtering = filterCount > 0 || !!searchTerm;
  const resetFilters = () => { setSearch(''); setFilters(emptySalesFilters); setDraft(emptySalesFilters); setFilterError(''); setFiltersOpen(false); };
  const applyFilters = () => {
    try { salesDateBounds(draft); setFilters(draft); setFiltersOpen(false); setFilterError(''); }
    catch (error) { setFilterError(error instanceof Error ? error.message : 'Vérifiez les dates.'); }
  };
  const { membership } = useAuth();
  const { formatMoney, formatForCurrency } = useCurrency();
  const company = membership?.companyId ?? '';
  const store = membership?.storeId ?? '';
  const employee = membership?.role === 'employee';
  const canReadFinancials = membership?.role === 'company_admin';
  useSalesRealtime(company);
  const sales = useInfiniteQuery({
    queryKey: ['sales', company, store, 'history-only', criteria],
    queryFn: ({ pageParam }) => getFilteredSales(company, store, pageParam, criteria),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => lastPage.length === SALE_PAGE_SIZE ? pages.length : undefined,
    enabled: !!company && !!store,
  });
  const refetchSales = sales.refetch;
  const rows = sales.data?.pages.flat() ?? [];
  const saleIds = rows.map(sale => sale.id);
  const profits = useQuery({
    queryKey: ['sales', company, store, 'financials', saleIds],
    queryFn: () => getHistoryFinancials(company, store, saleIds),
    enabled: !!company && !!store && canReadFinancials && saleIds.length > 0,
  });
  const refetchProfits = profits.refetch;
  const hasSales = rows.length > 0;
  useFocusEffect(useCallback(() => {
    if (!company || !store) return;
    void refetchSales();
    if (canReadFinancials) {
      if (hasSales) void refetchProfits();
    }
  }, [company, store, canReadFinancials, hasSales, refetchSales, refetchProfits]));
  const profitsBySale = new Map(profits.data?.map(row => [row.sale_id, row]));
  const revenue = rows.reduce((sum, sale) => sum + Number(sale.total), 0);

  return (
    <AdminPage title="Ventes" action={<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{(can('sales.write')) && <AppButton icon="plus" onPress={() => router.push((employee ? '/employee/sales/new' : '/sales/new') as never)}>Ajouter</AppButton>}</View>}>
      <PendingSales />
      <Searchbar placeholder="Rechercher une référence ou un client" value={search} onChangeText={setSearch} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <AppButton mode="outlined" icon="filter-variant" onPress={() => {
          setDraft(filters); setFilterError(''); setFiltersOpen(value => !value);
        }}>{filtersOpen ? 'Fermer les filtres' : `Filtrer${filterCount ? ` (${filterCount})` : ''}`}</AppButton>
        {(filtering || !!search) && <AppButton mode="text" onPress={resetFilters}>Réinitialiser</AppButton>}
      </View>
      {filtersOpen && <Card mode="outlined"><Card.Content style={{ gap: 14 }}>
        <Text variant="titleMedium">Filtrer les ventes</Text>
        <SelectField label="Période" value={draft.period} options={periodOptions} onChange={value => {
          setDraft(current => ({ ...current, period: value as SalesFilters['period'], startDate: current.startDate || today, endDate: current.endDate || today })); setFilterError('');
        }} />
        {draft.period === 'custom' && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <View style={{ flexGrow: 1, flexBasis: 240 }}><DateField label="Du" value={draft.startDate} maxDate={draft.endDate || today} onChange={value => setDraft(current => ({ ...current, startDate: value }))} /></View>
          <View style={{ flexGrow: 1, flexBasis: 240 }}><DateField label="Au" value={draft.endDate} minDate={draft.startDate} maxDate={today} onChange={value => setDraft(current => ({ ...current, endDate: value }))} /></View>
        </View>}
        <SelectField label="Moyen de paiement" value={draft.payment} options={paymentOptions} onChange={value => setDraft(current => ({ ...current, payment: value }))} />
        <SelectField label="Règlement" value={draft.status} options={statusOptions} onChange={value => setDraft(current => ({ ...current, status: value as SalesFilters['status'] }))} />
        {!!filterError && <HelperText type="error" visible>{filterError}</HelperText>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <AppButton onPress={applyFilters}>Appliquer</AppButton>
          <AppButton mode="text" onPress={() => { setFiltersOpen(false); setFilterError(''); }}>Annuler</AppButton>
        </View>
      </Card.Content></Card>}
      {filterCount > 0 && <Text style={{ color: theme.colors.onSurfaceVariant }}>
        {[filters.period !== 'all' && (filters.period === 'custom' ? `Du ${filters.startDate.split('-').reverse().join('/')} au ${filters.endDate.split('-').reverse().join('/')}` : periodOptions.find(option => option.value === filters.period)?.label), filters.payment && paymentOptions.find(option => option.value === filters.payment)?.label, filters.status !== 'all' && statusOptions.find(option => option.value === filters.status)?.label].filter(Boolean).join(' · ')}
      </Text>}
      {!!rows.length && <Card><Card.Content style={{ gap: 4 }}><Text variant="headlineSmall">{formatMoney(revenue)}</Text><Text>{rows.length === 1 ? 'Total de la vente affichée' : `Total des ${rows.length} ventes affichées`}</Text>{sales.hasNextPage && <Text variant="bodySmall">Chargez la suite pour afficher davantage de résultats.</Text>}</Card.Content></Card>}
      {sales.isLoading && <Text accessibilityLiveRegion="polite">Chargement des ventes…</Text>}
      {canReadFinancials && !!profits.error && <View><HelperText type="error" visible>Les ventes sont chargées, mais leurs bénéfices sont indisponibles.</HelperText><AppButton mode="text" loading={profits.isFetching} onPress={() => void profits.refetch()}>Réessayer les bénéfices</AppButton></View>}
      {!!sales.error && <View><HelperText type="error" visible>{sales.error.message}</HelperText><AppButton mode="text" loading={sales.isFetching} onPress={() => void (sales.isFetchNextPageError ? sales.fetchNextPage() : sales.refetch())}>Réessayer</AppButton></View>}
      {rows.map((sale) => {
        const historicalMoney = (value: number) => formatForCurrency(value, sale.currency_code);
        const profit = profitsBySale.get(sale.id);
        return <Card key={sale.id} mode="outlined" onPress={() => router.push((employee ? `/employee/sales/${sale.id}` : `/sales/${sale.id}`) as never)}><Card.Title title={sale.reference ?? 'Vente'} subtitle={`${sale.store_id !== store && sale.store?.name ? `${sale.store.name} · ` : ''}${paymentLabels[sale.payment_method ?? ''] ?? sale.payment_method ?? 'Paiement'}`} right={() => <Text variant="titleMedium" style={{ marginRight: 16 }}>{historicalMoney(Number(sale.total))}</Text>} /><Card.Content><Text>{formatDateTime(sale.created_at)}{canReadFinancials ? profit ? ` • Bénéfice : ${historicalMoney(Number(profit.gross_profit))}` : profits.isPending ? ' • Calcul du bénéfice…' : ' • Bénéfice indisponible' : ''}</Text>{sale.secondary_currency_code && sale.secondary_exchange_rate && <Text>Au taux historique : {formatForCurrency(Number(sale.total) * Number(sale.secondary_exchange_rate), sale.secondary_currency_code)}</Text>}</Card.Content></Card>;
      })}
      {sales.hasNextPage && <AppButton mode="outlined" icon="chevron-down" loading={sales.isFetchingNextPage} disabled={sales.isFetchingNextPage} onPress={() => void sales.fetchNextPage()}>Charger plus de ventes</AppButton>}
      {!sales.isLoading && !sales.error && !rows.length && <EmptyState icon={filtering ? 'magnify' : 'cart-plus'} title={filtering ? 'Aucune vente trouvée' : 'Aucune vente'} message={filtering ? 'Modifiez les filtres ou la recherche.' : 'Enregistrez votre première vente.'} action={filtering ? <AppButton mode="outlined" onPress={resetFilters}>Effacer les filtres</AppButton> : (can('sales.write')) ? <AppButton icon="plus" onPress={() => router.push((employee ? '/employee/sales/new' : '/sales/new') as never)}>Nouvelle vente</AppButton> : undefined} />}

      <AppFeedback message={feedback} onDismiss={()=>setFeedback('')}/>
    </AdminPage>
  );
}
