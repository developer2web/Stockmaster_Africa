import { getSaleReturns } from '@/features/sales/returns';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Card, Divider, HelperText, Text } from 'react-native-paper';

import { AdminPage } from '@/components/ui/AdminPage';
import { useAuth } from '@/features/auth/AuthProvider';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import { formatQuantity } from '@/utils/number';
import { getSale } from '@/features/sales/api';
import { printReceipt, shareReceipt } from '@/features/sales/receipt';
import { AppButton } from '@/components/ui/AppButton';
import { useReceiptAction } from '@/features/payments/useReceiptAction';
import { useReceiptBranding } from '@/features/payments/branding';
import { AppFeedback } from '@/components/ui/AppFeedback';
import { useState } from 'react';
import { formatDateTime } from '@/utils/format';

export default function SaleDetails() {
  const { membership } = useAuth();
  const employee = membership?.role === 'employee';
  const canReturn = membership?.role === 'company_admin' || !!membership?.permissions.includes('sales.refund');
  const { id,notice } = useLocalSearchParams<{ id: string;notice?:string }>();
  const [showDetails, setShowDetails] = useState(!notice);
  const canCreateSale = membership?.role === 'company_admin' || !!membership?.permissions.includes('sales.write');
  const returns = useQuery({ queryKey: ['sale-returns', id], queryFn: () => getSaleReturns(id!), enabled: !!id && canReturn });
  const [feedback,setFeedback]=useState(notice??'');
  const { formatForCurrency } = useCurrency();
  const sale = useQuery({ queryKey: ['sale', id, employee], queryFn: () => getSale(id!, !employee), enabled: !!id });
  const receipt=useReceiptAction();
  const branding=useReceiptBranding(sale.data?.store?.name, sale.data?.store_id);
  const money = (value: number) => formatForCurrency(value, sale.data?.currency_code ?? 'GNF');

  return (
    <AdminPage title={sale.data?.reference ?? 'Détail de la vente'}>
      {!!sale.error && <HelperText type="error" visible>{sale.error.message}</HelperText>}
      {sale.isLoading && <Text>Chargement de la vente…</Text>}
      {sale.data && <>
        <Card mode="contained"><Card.Content style={{ gap: 8 }}>
          <Text variant="titleLarge">Enregistrée sur le serveur</Text>
          <Text>{sale.data.reference} · {money(Number(sale.data.total))}</Text>
          <Text>{Number(sale.data.amount_due) > 0 ? 'Le crédit reste à encaisser auprès du client.' : 'Le paiement a été enregistré.'}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {canCreateSale && <AppButton icon="cart-plus" onPress={() => router.replace((employee ? '/employee/sales/new' : '/sales/new') as never)}>Nouvelle vente</AppButton>}
            <AppButton mode="outlined" icon="share-variant" loading={receipt.runningKey === 'share'} disabled={!!receipt.runningKey} onPress={() => void receipt.run('share', () => shareReceipt(sale.data!, branding, money))}>Partager le reçu</AppButton>
            <AppButton mode="text" icon="receipt-text-outline" onPress={() => setShowDetails(value => !value)}>{showDetails ? 'Masquer le détail' : 'Voir le détail'}</AppButton>
          </View>
        </Card.Content></Card>
        {showDetails && <>
        <Card><Card.Content style={{ gap: 6 }}>
          <Text variant="headlineMedium">{money(Number(sale.data.total))}</Text>
          {sale.data.secondary_currency_code && sale.data.secondary_exchange_rate && <Text>Valeur secondaire au taux original : {formatForCurrency(Number(sale.data.total) * Number(sale.data.secondary_exchange_rate), sale.data.secondary_currency_code)}</Text>}
          <Text>{sale.data.store?.name} • {formatDateTime(sale.data.created_at)}</Text>
          <Divider />
          <Text>Sous-total : {money(Number(sale.data.subtotal))}</Text>
          <Text>Remises : {money(Number(sale.data.discount_total))}</Text>
          <Text>Montant payé : {money(Number(sale.data.amount_paid))}</Text>
          {Number(sale.data.amount_due)>0&&<Text variant="titleMedium" style={{color:'#C92A2A'}}>Reste dû : {money(Number(sale.data.amount_due))} • {sale.data.payment_status==='credit'?'À crédit':'Paiement partiel'}</Text>}
          {!employee && <Text>Coût historique : {money(Number(sale.data.cost_total))}</Text>}
          {!employee && <Text variant="titleMedium" style={{ color: '#084B50' }}>Bénéfice brut : {money(Number(sale.data.gross_profit))}</Text>}
        </Card.Content></Card>
        <Card mode="outlined"><Card.Content style={{flexDirection:'row',flexWrap:'wrap',gap:10}}><AppButton mode="outlined" icon="printer" loading={receipt.runningKey==='print'} disabled={!!receipt.runningKey} onPress={()=>void receipt.run('print',()=>printReceipt(sale.data!,branding,money))}>Imprimer</AppButton><AppButton mode="outlined" icon="file-pdf-box" loading={receipt.runningKey==='share'} disabled={!!receipt.runningKey} onPress={()=>void receipt.run('share',()=>shareReceipt(sale.data!,branding,money))}>Partager PDF</AppButton>{canReturn&&<AppButton icon="cash-refund" onPress={()=>router.push({pathname:(employee?'/employee/sales/refund':'/sales/refund') as never,params:{id}})}>Retour / remboursement</AppButton>}</Card.Content></Card>
        <Text variant="headlineSmall">Articles</Text>
        {(sale.data.sale_items ?? []).map((item) => <Card key={item.id} mode="outlined"><Card.Title title={item.variant ? `${item.product?.name} • ${item.variant.name}` : item.product?.name ?? 'Produit'} subtitle={`${formatQuantity(item.quantity)} × ${money(Number(item.sale_price))}`} /><Card.Content><Text>Total hors taxe : {money(Number(item.line_total))} • Taxe : {money(Number(item.tax_amount??0))}{!employee ? ` • Coût unitaire conservé : ${money(Number(item.purchase_price_snapshot))}` : ''}</Text>{!employee && <Text style={{ color: '#084B50' }}>Bénéfice : {money(Number(item.gross_profit))}</Text>}</Card.Content></Card>)}
        {canReturn && <Card mode="outlined"><Card.Content style={{ gap: 8 }}>
          <Text variant="titleMedium">Historique des retours</Text>
          <Text>La vente originale est conservée. Pour corriger les articles facturés, enregistrez un retour puis, si nécessaire, une nouvelle vente.</Text>
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
