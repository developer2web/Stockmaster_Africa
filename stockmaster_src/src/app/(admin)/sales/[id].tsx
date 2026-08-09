import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { Card, Divider, HelperText, Text } from 'react-native-paper';

import { AdminPage } from '@/components/ui/AdminPage';
import { useAuth } from '@/features/auth/AuthProvider';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import { getSale } from '@/features/sales/api';

export default function SaleDetails() {
  const { membership } = useAuth();
  const employee = membership?.role === 'employee';
  const { id } = useLocalSearchParams<{ id: string }>();
  const { formatForCurrency } = useCurrency();
  const sale = useQuery({ queryKey: ['sale', id], queryFn: () => getSale(id!), enabled: !!id });
  const money = (value: number) => formatForCurrency(value, sale.data?.currency_code ?? 'CAD');

  return (
    <AdminPage title={sale.data?.reference ?? 'Détail de la vente'}>
      {!!sale.error && <HelperText type="error" visible>{sale.error.message}</HelperText>}
      {sale.data && <>
        <Card><Card.Content style={{ gap: 6 }}>
          <Text variant="headlineMedium">{money(Number(sale.data.total))}</Text>
          {sale.data.secondary_currency_code && sale.data.secondary_exchange_rate && <Text>Valeur secondaire au taux original : {formatForCurrency(Number(sale.data.total) * Number(sale.data.secondary_exchange_rate), sale.data.secondary_currency_code)}</Text>}
          <Text>{sale.data.store?.name} • {new Date(sale.data.created_at).toLocaleString()}</Text>
          <Divider />
          <Text>Sous-total : {money(Number(sale.data.subtotal))}</Text>
          <Text>Remises : {money(Number(sale.data.discount_total))}</Text>
          {!employee && <Text>Coût historique : {money(Number(sale.data.cost_total))}</Text>}
          {!employee && <Text variant="titleMedium" style={{ color: '#087F5B' }}>Bénéfice brut : {money(Number(sale.data.gross_profit))}</Text>}
        </Card.Content></Card>
        <Text variant="headlineSmall">Articles</Text>
        {(sale.data.sale_items ?? []).map((item) => <Card key={item.id} mode="outlined"><Card.Title title={item.variant ? `${item.product?.name} • ${item.variant.name}` : item.product?.name ?? 'Produit'} subtitle={`${Number(item.quantity).toFixed(3)} × ${money(Number(item.sale_price))}`} /><Card.Content><Text>Total : {money(Number(item.line_total))}{!employee ? ` • Coût unitaire conservé : ${money(Number(item.purchase_price_snapshot))}` : ''}</Text>{!employee && <Text style={{ color: '#087F5B' }}>Bénéfice : {money(Number(item.gross_profit))}</Text>}</Card.Content></Card>)}
      </>}
    </AdminPage>
  );
}
