import { PendingSales } from '@/features/offline/PendingSales';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { Card, Chip, HelperText, Searchbar, Text } from 'react-native-paper';

import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/features/auth/AuthProvider';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import { getSales, SALE_PAGE_SIZE } from '@/features/sales/api';
import { getLifetimeNetProfit } from '@/features/reports/api';
import { useSalesRealtime } from '@/hooks/useSalesRealtime';
import { AppFeedback } from '@/components/ui/AppFeedback';
import { formatDateTime } from '@/utils/format';

const paymentLabels: Record<string, string> = {
  cash: 'Espèces', card: 'Carte', mobile_money: 'Mobile Money',
  bank_transfer: 'Virement', mixed: 'Mixte',
};

export default function SalesScreen() {
  const {notice}=useLocalSearchParams<{notice?:string}>();
  const [feedback,setFeedback]=useState(notice??'');
  const [search,setSearch]=useState('');
  const [paymentFilter,setPaymentFilter]=useState<'all'|'cash'|'mobile_money'|'card'|'credit'>('all');
  const [period,setPeriod]=useState<'all'|'today'|'7'|'30'>('all');
  const { membership } = useAuth();
  const { formatMoney, formatForCurrency } = useCurrency();
  const company = membership?.companyId ?? '';
  const store = membership?.storeId ?? '';
  const employee = membership?.role === 'employee';
  useSalesRealtime(company);
  const sales = useInfiniteQuery({
    queryKey: ['sales', company, store],
    queryFn: ({ pageParam }) => getSales(company, store, pageParam, !employee),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => lastPage.length === SALE_PAGE_SIZE ? pages.length : undefined,
    enabled: !!company && !!store,
  });
  const financialReport = useQuery({
    queryKey: ['sales-net-profit', company, store],
    queryFn: () => getLifetimeNetProfit(store),
    enabled: !!company && !!store && !employee,
  });
  const refetchSales=sales.refetch;
  const refetchFinancials=financialReport.refetch;
  useFocusEffect(useCallback(()=>{if(company&&store){void refetchSales();if(!employee)void refetchFinancials()}},[company,store,employee,refetchSales,refetchFinancials]));
  const rows = sales.data?.pages.flat() ?? [];
  const visibleRows = rows.filter((sale) => {
    const needle = search.trim().toLowerCase();
    const matchesSearch = !needle || `${sale.reference ?? ''} ${sale.customer?.name ?? ''} ${sale.store?.name ?? ''}`.toLowerCase().includes(needle);
    const matchesPayment = paymentFilter === 'all' || sale.payment_method === paymentFilter || (paymentFilter === 'credit' && sale.payment_status === 'credit');
    const age = (Date.now() - new Date(sale.created_at).getTime()) / 86_400_000;
    const matchesPeriod = period === 'all' || (period === 'today' ? new Date(sale.created_at).toDateString() === new Date().toDateString() : age <= Number(period));
    return matchesSearch && matchesPayment && matchesPeriod;
  });
  const revenue = rows.reduce((sum, sale) => sum + Number(sale.total), 0);

  return (
    <AdminPage title="Ventes" action={<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{(membership?.role === 'company_admin' || membership?.permissions.includes('sales.write')) && <AppButton icon="plus" onPress={() => router.push((employee ? '/employee/sales/new' : '/sales/new') as never)}>Ajouter</AppButton>}</View>}>
      <PendingSales />
      <Card><Card.Content><Text variant="headlineSmall">{formatMoney(revenue)}</Text><Text>Chiffre d’affaires affiché</Text>{!employee && <Text variant="titleMedium" style={{ color: '#084B50' }}>{formatMoney(financialReport.data ?? 0)} de bénéfice net après toutes les dépenses</Text>}</Card.Content></Card>
      <Searchbar placeholder="Rechercher une référence, un client…" value={search} onChangeText={setSearch} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(['all', 'today', '7', '30'] as const).map((value) => <Chip key={value} selected={period === value} onPress={() => setPeriod(value)}>{value === 'all' ? 'Toutes les dates' : value === 'today' ? "Aujourd'hui" : `${value} jours`}</Chip>)}
        {(['all', 'cash', 'mobile_money', 'card', 'credit'] as const).map((value) => <Chip key={value} selected={paymentFilter === value} onPress={() => setPaymentFilter(value)}>{value === 'all' ? 'Tous les paiements' : paymentLabels[value] ?? 'Crédit'}</Chip>)}
      </View>
      {!!sales.error && <HelperText type="error" visible>{sales.error.message}</HelperText>}
      {visibleRows.map((sale) => {
        const historicalMoney = (value: number) => formatForCurrency(value, sale.currency_code);
        return <Card key={sale.id} mode="outlined" onPress={() => router.push((employee ? `/employee/sales/${sale.id}` : `/sales/${sale.id}`) as never)}><Card.Title title={sale.reference ?? 'Vente'} subtitle={`${sale.store?.name ?? 'Boutique'} • ${paymentLabels[sale.payment_method ?? ''] ?? sale.payment_method ?? 'Paiement'}`} right={() => <Text variant="titleMedium" style={{ marginRight: 16 }}>{historicalMoney(Number(sale.total))}</Text>} /><Card.Content><Text style={{color:'#084B50'}}>Enregistrée sur le serveur</Text><Text>{formatDateTime(sale.created_at)}{!employee ? ` • Bénéfice : ${historicalMoney(Number(sale.gross_profit))}` : ''}</Text>{sale.secondary_currency_code && sale.secondary_exchange_rate && <Text>Au taux historique : {formatForCurrency(Number(sale.total) * Number(sale.secondary_exchange_rate), sale.secondary_currency_code)}</Text>}</Card.Content></Card>;
      })}
      {sales.hasNextPage && <AppButton mode="outlined" icon="chevron-down" loading={sales.isFetchingNextPage} onPress={() => void sales.fetchNextPage()}>Charger plus de ventes</AppButton>}
      {!sales.isLoading && !visibleRows.length && <EmptyState icon="cart-plus" title={rows.length ? 'Aucun résultat' : "Aucune vente aujourd’hui"} message={rows.length ? 'Modifiez les filtres ou la recherche.' : 'Enregistrez une vente à partir du catalogue ou du scanner.'} action={rows.length ? undefined : <AppButton icon="plus" onPress={()=>router.push((employee?'/employee/sales/new':'/sales/new') as never)}>Nouvelle vente</AppButton>}/>} 
      <AppFeedback message={feedback} onDismiss={()=>setFeedback('')}/>
    </AdminPage>
  );
}
