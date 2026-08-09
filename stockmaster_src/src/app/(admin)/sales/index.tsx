import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Card, FAB, HelperText, Text } from 'react-native-paper';

import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/features/auth/AuthProvider';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import { getSales, SALE_PAGE_SIZE } from '@/features/sales/api';
import { getLifetimeNetProfit } from '@/features/reports/api';
import { useSalesRealtime } from '@/hooks/useSalesRealtime';

const paymentLabels: Record<string, string> = {
  cash: 'Espèces', card: 'Carte', mobile_money: 'Mobile Money',
  bank_transfer: 'Virement', mixed: 'Mixte',
};

export default function SalesScreen() {
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
  const rows = sales.data?.pages.flat() ?? [];
  const revenue = rows.reduce((sum, sale) => sum + Number(sale.total), 0);

  return (
    <AdminPage title="Ventes" action={membership?.role === 'company_admin' || membership?.permissions.includes('sales.write') ? <FAB size="small" icon="plus" onPress={() => router.push((employee ? '/employee/sales/new' : '/sales/new') as never)} /> : undefined}>
      <Card><Card.Content><Text variant="headlineSmall">{formatMoney(revenue)}</Text><Text>Chiffre d’affaires affiché</Text>{!employee && <Text variant="titleMedium" style={{ color: '#087F5B' }}>{formatMoney(financialReport.data ?? 0)} de bénéfice net après toutes les dépenses</Text>}</Card.Content></Card>
      {!!sales.error && <HelperText type="error" visible>{sales.error.message}</HelperText>}
      {rows.map((sale) => {
        const historicalMoney = (value: number) => formatForCurrency(value, sale.currency_code);
        return <Card key={sale.id} mode="outlined" onPress={() => router.push((employee ? `/employee/sales/${sale.id}` : `/sales/${sale.id}`) as never)}><Card.Title title={sale.reference ?? 'Vente'} subtitle={`${sale.store?.name ?? 'Boutique'} • ${paymentLabels[sale.payment_method ?? ''] ?? sale.payment_method ?? 'Paiement'}`} right={() => <Text variant="titleMedium" style={{ marginRight: 16 }}>{historicalMoney(Number(sale.total))}</Text>} /><Card.Content><Text>{new Date(sale.created_at).toLocaleString()}{!employee ? ` • Bénéfice : ${historicalMoney(Number(sale.gross_profit))}` : ''}</Text>{sale.secondary_currency_code && sale.secondary_exchange_rate && <Text>Au taux historique : {formatForCurrency(Number(sale.total) * Number(sale.secondary_exchange_rate), sale.secondary_currency_code)}</Text>}</Card.Content></Card>;
      })}
      {sales.hasNextPage && <AppButton mode="outlined" icon="chevron-down" loading={sales.isFetchingNextPage} onPress={() => void sales.fetchNextPage()}>Charger plus de ventes</AppButton>}
      {!sales.isLoading && !rows.length && <EmptyState icon="cart-plus" title="Aucune vente" message="Créez votre première vente à partir du catalogue ou du scanner." />}
    </AdminPage>
  );
}
