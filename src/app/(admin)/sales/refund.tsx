import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Card, Chip, HelperText, Text, TextInput } from 'react-native-paper';

import { SelectField } from '@/components/forms/SelectField';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { useAuth } from '@/features/auth/AuthProvider';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import { getCompany } from '@/features/employees/api';
import { getSale } from '@/features/sales/api';
import { getSaleReturns, recordSaleReturn, type ReturnDisposition } from '@/features/sales/returns';
import { formatQuantity, parseDecimal } from '@/utils/number';

const methods = [{ label: 'Espèces', value: 'cash' }, { label: 'Mobile Money', value: 'mobile_money' }];
const dispositions = [{ label: 'Remettre en stock', value: 'restock' }, { label: 'Produit endommagé', value: 'damaged' }, { label: 'Produit perdu', value: 'lost' }];

export default function SaleRefundScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { membership } = useAuth();
  const { formatMoney } = useCurrency();
  const cache = useQueryClient();
  const companyId = membership?.companyId ?? '';
  const sale = useQuery({ queryKey: ['sale', id, false], queryFn: () => getSale(id!, false), enabled: !!id });
  const returns = useQuery({ queryKey: ['sale-returns', id], queryFn: () => getSaleReturns(id!), enabled: !!id });
  const company = useQuery({ queryKey: ['company', companyId], queryFn: () => getCompany(companyId), enabled: !!companyId });
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [itemDispositions, setItemDispositions] = useState<Record<string, ReturnDisposition>>({});
  const [method, setMethod] = useState<string | null>('cash');
  const [note, setNote] = useState('');
  const returned = useMemo(() => {
    const map: Record<string, number> = {};
    for (const current of returns.data ?? []) for (const item of current.sale_return_items) map[item.sale_item_id] = (map[item.sale_item_id] ?? 0) + Number(item.quantity);
    return map;
  }, [returns.data]);
  const items = (sale.data?.sale_items ?? []).map((item) => ({ item, remaining: Number(item.quantity) - (returned[item.id] ?? 0), quantity: parseDecimal(quantities[item.id] ?? '0') || 0, disposition: itemDispositions[item.id] ?? 'restock' as ReturnDisposition }));
  const refund = useMutation({
    mutationFn: () => recordSaleReturn({ saleId: id!, items: items.filter((row) => row.quantity > 0).map((row) => ({ saleItemId: row.item.id, quantity: row.quantity, disposition: row.disposition })), refundMethod: method!, note }),
    onSuccess: async () => {
      await Promise.all([cache.invalidateQueries({ queryKey: ['sale-returns', id] }), cache.invalidateQueries({ queryKey: ['sale', id] }), cache.invalidateQueries({ queryKey: ['sale-stock'] }), cache.invalidateQueries({ queryKey: ['stock-levels'] }), cache.invalidateQueries({ queryKey: ['cash-summary'] }), cache.invalidateQueries({ queryKey: ['customer-ledger'] })]);
      router.back();
    },
  });
  const reasonRequired = company.data?.require_refund_reason ?? true;
  const valid = !!method && (!reasonRequired || note.trim().length >= 3) && items.some((row) => row.quantity > 0) && items.every((row) => row.quantity >= 0 && row.quantity <= row.remaining);

  return <AdminPage title="Retour et remboursement">
    {!!sale.error && <HelperText type="error" visible>{sale.error.message}</HelperText>}
    {sale.data && <Card mode="contained"><Card.Title title={sale.data.reference ?? 'Vente'} subtitle={`Total initial : ${formatMoney(Number(sale.data.total))} • Payé : ${formatMoney(Number(sale.data.amount_paid ?? sale.data.total))}`} /></Card>}
    <Text variant="titleLarge" style={{ fontWeight: '800' }}>Articles à retourner</Text>
    {items.map(({ item, remaining }) => <Card key={item.id} mode="outlined">
      <Card.Title title={item.variant ? `${item.product?.name} • ${item.variant.name}` : item.product?.name ?? 'Produit'} subtitle={`Retournable : ${formatQuantity(remaining)} • ${formatMoney((Number(item.line_total) + Number(item.tax_amount ?? 0)) / Number(item.quantity))} par unité`} right={() => remaining <= 0 ? <Chip style={{ marginRight: 12 }}>Déjà retourné</Chip> : null} />
      {remaining > 0 && <Card.Content style={{ gap: 10 }}><TextInput mode="outlined" label="Quantité retournée" value={quantities[item.id] ?? ''} onChangeText={(value) => setQuantities((current) => ({ ...current, [item.id]: value }))} keyboardType="decimal-pad" error={(parseDecimal(quantities[item.id] ?? '0') || 0) > remaining} /><SelectField label="État du produit retourné" value={itemDispositions[item.id] ?? 'restock'} onChange={(value) => setItemDispositions((current) => ({ ...current, [item.id]: (value ?? 'restock') as ReturnDisposition }))} options={dispositions} /></Card.Content>}
    </Card>)}
    <SelectField label="Mode de remboursement" value={method} onChange={setMethod} options={methods} />
    <TextInput mode="outlined" label={reasonRequired ? 'Motif obligatoire' : 'Motif ou note'} value={note} onChangeText={setNote} multiline error={reasonRequired && note.length > 0 && note.trim().length < 3} />
    {method === 'credit_note' && <HelperText type="info" visible>L’avoir sera enregistré sur le compte du client associé à cette vente.</HelperText>}
    <HelperText type="info" visible>La dette restante est réduite avant tout remboursement d’argent. Un article endommagé ou perdu ne retourne pas dans le stock vendable.</HelperText>
    {!!refund.error && <HelperText type="error" visible>{refund.error.message}</HelperText>}
    <AppButton icon="cash-refund" loading={refund.isPending} disabled={!valid || refund.isPending} onPress={() => refund.mutate()}>Valider le retour</AppButton>
  </AdminPage>;
}
