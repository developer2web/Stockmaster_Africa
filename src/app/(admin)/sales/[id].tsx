import { usePermissions } from '@/features/auth/usePermissions';
import { getSaleReturns } from '@/features/sales/returns';
import { useWindowDimensions, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Card, Divider, HelperText, IconButton, Menu, Text, useTheme } from 'react-native-paper';

import { AdminPage } from '@/components/ui/AdminPage';
import { useAuth } from '@/features/auth/AuthProvider';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import { formatQuantity } from '@/utils/number';
import { getSale } from '@/features/sales/api';
import { getHistoryFinancials, getSaleItemFinancials } from '@/features/sales/historyFinancials';
import { AccessDiagnosticsCard } from '@/components/security/AccessDiagnosticsCard';
import { printReceipt, shareReceipt } from '@/features/sales/receipt';
import { AppButton } from '@/components/ui/AppButton';
import { useReceiptAction } from '@/features/payments/useReceiptAction';
import { useReceiptBranding } from '@/features/payments/branding';
import { AppFeedback } from '@/components/ui/AppFeedback';
import { useState } from 'react';
import { formatDateTime } from '@/utils/format';
import { readableError } from '@/utils/errors';

export default function SaleDetails() {
  const can = usePermissions();
  const { membership } = useAuth();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const [actionsOpen, setActionsOpen] = useState(false);
  const employee = membership?.role === 'employee';
  const canReadFinancials = membership?.role === 'company_admin';
  const canReturn = can('sales.refund');
  const { id,notice } = useLocalSearchParams<{ id: string;notice?:string }>();
  const [showDetails, setShowDetails] = useState(!notice);
  const canCreateSale = can('sales.write');
  const returns = useQuery({ queryKey: ['sale-returns', id], queryFn: () => getSaleReturns(id!), enabled: !!id && can('sales.read') });
  const [feedback,setFeedback]=useState(notice??'');
  const { formatForCurrency } = useCurrency();
  const sale = useQuery({ queryKey: ['sale', id, 'receipt'], queryFn: () => getSale(id!, false), enabled: !!id && !!membership });
  const financials = useQuery({
    queryKey: ['sale', id, 'financial-summary', sale.data?.company_id, sale.data?.store_id],
    queryFn: async () => (await getHistoryFinancials(sale.data!.company_id, sale.data!.store_id!, [id!]))[0] ?? null,
    enabled: canReadFinancials && !!sale.data?.company_id && !!sale.data?.store_id,
  });
  const financialItems = useQuery({
    queryKey: ['sale', id, 'financial-items', sale.data?.company_id],
    queryFn: () => getSaleItemFinancials(sale.data!.company_id, id!),
    enabled: canReadFinancials && !!sale.data?.company_id,
  });
  const itemFinancials = new Map(financialItems.data?.map(item => [item.sale_item_id, item]));
  const receipt=useReceiptAction();
  const branding=useReceiptBranding(sale.data?.store?.name, sale.data?.store_id);
  const money = (value: number) => formatForCurrency(value, sale.data?.currency_code ?? 'GNF');

  return (
    <AdminPage title={sale.data?.reference ?? 'Détail de la vente'}>
      {!!sale.error && <><HelperText type="error" visible>{sale.error.message}</HelperText><AppButton loading={sale.isFetching} onPress={() => void sale.refetch()}>Réessayer le chargement</AppButton><AccessDiagnosticsCard saleId={id} /></>}
      {sale.isLoading && <Text>Chargement de la vente…</Text>}
      {sale.data && <>
        <Card mode="contained"><Card.Content style={{ gap: 8 }}>
          <Text variant="labelLarge">Vente enregistrée</Text>
          <Text variant="headlineMedium">{money(Number(sale.data.total))}</Text>
          <Text>{formatDateTime(sale.data.created_at)}{sale.data.store_id !== membership?.storeId && sale.data.store?.name ? ` · ${sale.data.store.name}` : ''}</Text>
          <Text>{Number(sale.data.amount_due) > 0 ? 'Crédit à encaisser' : 'Paiement reçu'}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {canCreateSale && <AppButton icon="cart-plus" onPress={() => router.replace((employee ? '/employee/sales/new' : '/sales/new') as never)}>Nouvelle vente</AppButton>}
            <AppButton mode="outlined" icon="share-variant" loading={receipt.runningKey === 'share'} disabled={!!receipt.runningKey} onPress={() => void receipt.run('share', () => shareReceipt(sale.data!, branding, money))}>Partager le reçu</AppButton>
            <AppButton mode="text" icon="receipt-text-outline" onPress={() => setShowDetails(value => !value)}>{showDetails ? 'Masquer le détail' : 'Voir le détail'}</AppButton>
            <Menu theme={{ animation: { scale: 0 } }} visible={actionsOpen} onDismiss={() => setActionsOpen(false)} contentStyle={{ maxWidth: Math.min(300, width - 32) }} anchor={<IconButton icon="dots-horizontal" accessibilityLabel="Autres actions de la vente" loading={receipt.runningKey === 'print'} disabled={!!receipt.runningKey} style={{ margin: 0, width: 48, height: 48 }} onPress={() => setActionsOpen(true)} />}>
              <Menu.Item leadingIcon="printer" title="Imprimer" onPress={() => { setActionsOpen(false); void receipt.run('print', () => printReceipt(sale.data!, branding, money)); }} />
              {canReturn && <Menu.Item leadingIcon="cash-refund" title="Retour / remboursement" onPress={() => { setActionsOpen(false); router.push({ pathname: (employee ? '/employee/sales/refund' : '/sales/refund') as never, params: { id } }); }} />}
            </Menu>
          </View>
        </Card.Content></Card>
        {showDetails && <>
        <Card><Card.Content style={{ gap: 6 }}>
          <Text variant="titleMedium">Détail des montants</Text>
          {sale.data.secondary_currency_code && sale.data.secondary_exchange_rate && <Text>Valeur secondaire au taux original : {formatForCurrency(Number(sale.data.total) * Number(sale.data.secondary_exchange_rate), sale.data.secondary_currency_code)}</Text>}
          <Divider />
          <Text>Sous-total : {money(Number(sale.data.subtotal))}</Text>
          <Text>Remises : {money(Number(sale.data.discount_total))}</Text>
          <Text>Montant payé : {money(Number(sale.data.amount_paid))}</Text>
          {Number(sale.data.amount_due)>0&&<Text variant="titleMedium" style={{color:'#C92A2A'}}>Reste dû : {money(Number(sale.data.amount_due))} • {sale.data.payment_status==='credit'?'À crédit':'Paiement partiel'}</Text>}
          {canReadFinancials && (financials.data ? <>
            <Text>Coût historique : {money(Number(financials.data.cost_total))}</Text>
            <Text variant="titleMedium" style={{ color: theme.colors.primary }}>Bénéfice brut : {money(Number(financials.data.gross_profit))}</Text>
          </> : <Text>{financials.isPending ? 'Chargement des coûts et bénéfices…' : 'Coûts et bénéfices indisponibles'}</Text>)}
          {canReadFinancials && (!!financials.error || financials.isSuccess && !financials.data) && <HelperText type="error" visible>{financials.error ? `Coûts de la vente : ${readableError(financials.error)}` : 'Aucun coût ni bénéfice n’a été renvoyé pour cette vente.'}</HelperText>}
          {canReadFinancials && !!financialItems.error && <HelperText type="error" visible>Coûts des articles : {readableError(financialItems.error)}</HelperText>}
          {canReadFinancials && (!!financials.error || !!financialItems.error || financials.isSuccess && !financials.data) && <AppButton mode="text" loading={financials.isFetching || financialItems.isFetching} onPress={() => { void financials.refetch(); void financialItems.refetch(); }}>Réessayer les bénéfices</AppButton>}
        </Card.Content></Card>
        {canReadFinancials && (!!financials.error || !!financialItems.error || financials.isSuccess && !financials.data) && <AccessDiagnosticsCard saleId={id} />}
        <Text variant="headlineSmall">Articles</Text>
        {(sale.data.sale_items ?? []).map((item) => <Card key={item.id} mode="outlined"><Card.Title title={item.variant ? `${item.product?.name} • ${item.variant.name}` : item.product?.name ?? 'Produit'} subtitle={`${formatQuantity(item.quantity)} × ${money(Number(item.sale_price))}`} /><Card.Content><Text>Total hors taxe : {money(Number(item.line_total))} • Taxe : {money(Number(item.tax_amount??0))}{canReadFinancials && itemFinancials.has(item.id) ? ` • Coût unitaire conservé : ${money(Number(itemFinancials.get(item.id)!.purchase_price_snapshot))}` : ''}</Text>{canReadFinancials && itemFinancials.has(item.id) && <Text style={{ color: theme.colors.primary }}>Bénéfice : {money(Number(itemFinancials.get(item.id)!.gross_profit))}</Text>}</Card.Content></Card>)}
        {can('sales.read') && <Card mode="outlined"><Card.Content style={{ gap: 8 }}>
          <Text variant="titleMedium">Historique des retours</Text>
          <Text>Les retours conservent la vente d’origine.</Text>
          {returns.isLoading && <Text>Chargement des retours…</Text>}
          {!!returns.error && <HelperText type="error" visible>{returns.error.message}</HelperText>}
          {!returns.isLoading && !returns.error && !returns.data?.length && <Text>Aucun retour enregistré.</Text>}
          {returns.data?.map(item => <View key={item.id} style={{ gap: 4 }}><Text>{formatDateTime(item.created_at)}</Text><Text>Remboursé : {money(Number(item.refunded_amount))} · Dette réduite : {money(Number(item.debt_reduction))}</Text>{!!item.note && <Text>Motif : {item.note}</Text>}</View>)}
        </Card.Content></Card>}
        {!canReturn && <Text>Pour corriger une vente enregistrée, contactez un responsable autorisé à effectuer les retours.</Text>}
        </>}
      </>}
      <AppFeedback message={feedback} onDismiss={()=>setFeedback('')}/>
      <AppFeedback message={receipt.error??''} type="error" onDismiss={receipt.clearError}/>
    </AdminPage>
  );
}
