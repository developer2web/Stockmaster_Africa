import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Card, Chip, HelperText, Icon, IconButton, SegmentedButtons, Text, TextInput, useTheme } from 'react-native-paper';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { ProductThumbnail } from '@/components/products/ProductThumbnail';
import { SelectField } from '@/components/forms/SelectField';
import { getCustomers } from '@/features/customers/api';
import { getCompany } from '@/features/employees/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { createSale, getSaleStock } from '@/features/sales/api';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import { cartKey, useSaleCart } from '@/stores/saleCart';
import { formatQuantity, parseDecimal } from '@/utils/number';
import { useOffline } from '@/features/offline/OfflineProvider';
import { invalidateOperationalSummaries } from '@/utils/queryInvalidation';
import { AppSearchBar } from '@/components/ui/AppSearchBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { createOperationId } from '@/utils/operationId';
import { readableError } from '@/utils/errors';

export default function NewSale() {
  const { formatMoney } = useCurrency();
  const { productId, variantId } = useLocalSearchParams<{ productId?: string; variantId?: string }>();
  const { membership } = useAuth();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const desktop = width >= 1100;
  const company = membership?.companyId ?? '';
  const employee = membership?.role === 'employee';
  const storeId = membership?.storeId ?? '';
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [payment, setPayment] = useState('cash');
  const [amountPaid, setAmountPaid] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const cache = useQueryClient();
  const { refreshQueue } = useOffline();
  const { items, add, setQuantity, setDiscount, remove } = useSaleCart();
  const scannedAdded = useRef(false);
  const operationId=useRef(createOperationId());
  const stock = useQuery({
    queryKey: ['sale-stock', company, storeId, employee],
    queryFn: () => getSaleStock(company, storeId, !employee),
    enabled: !!company && !!storeId,
  });
  const customers = useQuery({
    queryKey: ['customers', company, ''],
    queryFn: () => getCustomers(company),
    enabled: !!company,
  });
  const companySettings=useQuery({queryKey:['company',company],queryFn:()=>getCompany(company),enabled:!!company});

  useEffect(() => {
    if (scannedAdded.current || !productId || !stock.data) return;
    const found = stock.data.find((item) =>
      item.productId === productId && (!variantId || item.variantId === variantId));
    if (found && (found.available > 0 || companySettings.data?.allow_negative_stock)) {
      add(found,!!companySettings.data?.allow_negative_stock);
      scannedAdded.current = true;
    }
  }, [productId, variantId, stock.data, companySettings.data?.allow_negative_stock, add]);

  const categories = Array.from(new Map((stock.data ?? []).filter(item=>item.categoryId).map(item=>[item.categoryId!,item.categoryName??'Catégorie'])).entries());
  const shown = (stock.data ?? [])
    .filter((item) => (!categoryId || item.categoryId===categoryId) && `${item.name} ${item.sku}`.toLowerCase().includes(search.trim().toLowerCase()))
    .slice(0, 30);
  const totals = useMemo(() => {
    const subtotal=items.reduce((sum, item) => sum + item.salePrice * item.quantity, 0);
    const discount=items.reduce((sum,item)=>sum+item.discount,0);
    const tax=Math.round((subtotal-discount)*Number(companySettings.data?.tax_rate??0))/100;
    return ({
    subtotal,
    discount,
    tax,
    total: subtotal-discount+tax,
    grossProfit: items.reduce(
      (sum, item) => sum + (item.salePrice - item.purchasePrice) * item.quantity-item.discount,
      0,
    ),
  })}, [items,companySettings.data?.tax_rate]);
  const discountTooHigh=items.some(item=>item.discount>item.salePrice*item.quantity*Number(companySettings.data?.max_discount_percent??100)/100);
  const save = useMutation({
    mutationFn: () => createSale(company, storeId, payment, items, customerId, payment==='credit'?0:payment==='partial'?parseDecimal(amountPaid):totals.total,operationId.current,!!companySettings.data?.allow_negative_stock),
    onSuccess: async (result) => {
      useSaleCart.getState().clear();
      scannedAdded.current = true;
      setCustomerId(null);
      setAmountPaid('');
      if (result.queued) {
        await refreshQueue();
        router.replace({pathname:(employee ? '/employee/sales' : '/sales') as never,params:{notice:'Vente enregistrée hors ligne'}});
        return;
      }
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['sales', company] }),
        cache.invalidateQueries({ queryKey: ['stock-levels', company] }),
        cache.invalidateQueries({ queryKey: ['sale-stock', company, storeId] }),
        cache.invalidateQueries({ queryKey: ['cash-transactions', company, storeId] }),
        cache.invalidateQueries({ queryKey: ['cash-summary', company, storeId] }),
        cache.invalidateQueries({ queryKey: ['customers', company] }),
        invalidateOperationalSummaries(cache, company, storeId),
      ]);
      router.replace({pathname:(employee ? `/employee/sales/${result.saleId}` : `/sales/${result.saleId}`) as never,params:{notice:'Vente enregistrée'}});
    },
  });

  return (
    <AdminPage
      title="Nouvelle vente"
      action={<AppButton mode="outlined" icon="barcode-scan" onPress={() => router.push({ pathname: (employee ? '/employee/scanner' : '/scanner') as never, params: { mode: 'sale' } })}>Scanner</AppButton>}
    >
      <View style={[styles.workspace, desktop && styles.workspaceDesktop]}>
      <View style={styles.catalogPane}>
      <Card mode="outlined" style={{ borderColor: theme.colors.primary }}>
        <Card.Content style={styles.notice}>
          <Chip icon="lock-outline">Catalogue en lecture seule</Chip>
          <Text style={{ color: theme.colors.onSurfaceVariant }}>
            La vente permet uniquement de choisir les articles et les quantités. Le produit, son prix et son stock se modifient depuis leurs modules d’origine.
          </Text>
        </Card.Content>
      </Card>
      <AppSearchBar placeholder="Rechercher un produit ou un SKU" value={search} onChangeText={setSearch} />
      <View style={styles.categoryFilters}><Chip selected={!categoryId} onPress={()=>setCategoryId(null)}>Tous</Chip>{categories.map(([id,name])=><Chip key={id} selected={categoryId===id} onPress={()=>setCategoryId(id)}>{name}</Chip>)}</View>
      {!!stock.error && <HelperText type="error" visible>{stock.error.message}</HelperText>}
      <View style={styles.list}>
        {shown.map((item) => {
          const available = item.available > 0 || !!companySettings.data?.allow_negative_stock;
          return (
            <Card key={cartKey(item)} mode="contained" style={[{ backgroundColor: theme.colors.surface }, !available && styles.unavailable]} onPress={available ? () => add(item,!!companySettings.data?.allow_negative_stock) : undefined}>
              <Card.Title
                left={() => <ProductThumbnail url={item.imageUrl} />}
                title={item.name}
                subtitle={`${item.sku} • Prix catalogue ${formatMoney(item.salePrice)}`}
                right={() => available
                  ? <Chip style={styles.chip} icon={item.available>0?'package-variant':'alert'}>Stock {formatQuantity(item.available)}</Chip>
                  : <Chip style={styles.chip} icon="alert-circle-outline">Stock épuisé</Chip>}
              />
              {!available && <Card.Content><Text style={{ color: theme.colors.error }}>Ajoutez le stock depuis la fiche Produit ou le module Stock.</Text></Card.Content>}
            </Card>
          );
        })}
        {!stock.isLoading && !shown.length && <EmptyState icon="package-variant" title="Aucun produit trouvé" message="Effacez la recherche ou choisissez une autre catégorie."/>}
      </View>
      </View>
      <View style={[styles.cartPane, desktop && styles.cartPaneDesktop]}>
      <Text variant="headlineSmall">Panier ({items.length})</Text>
      {!items.length && (
        <Card mode="outlined">
          <Card.Content style={styles.emptyCart}>
            <Icon source="cart-outline" size={34} color={theme.colors.onSurfaceVariant} />
            <Text variant="titleMedium">Votre panier est vide</Text>
            <Text style={{ color: theme.colors.onSurfaceVariant }}>Touchez un produit du catalogue pour l’ajouter.</Text>
          </Card.Content>
        </Card>
      )}
      {items.map((item) => {
        const id = cartKey(item);
        return (
          <Card key={id} mode="contained" style={{ backgroundColor: theme.colors.surface }}>
            <Card.Title left={()=><ProductThumbnail url={item.imageUrl}/>} title={item.name} subtitle={`${formatMoney(item.salePrice)} • disponible ${formatQuantity(item.available)} ${item.unit}`} right={() => <IconButton icon="delete" onPress={() => remove(id)} />} />
            <Card.Content style={styles.list}>
              <View style={styles.quantityRow}><IconButton mode="outlined" icon="minus" accessibilityLabel="Diminuer la quantité" disabled={item.quantity<=1} onPress={()=>setQuantity(id,item.quantity-1,!!companySettings.data?.allow_negative_stock)}/><TextInput style={styles.quantityInput} mode="outlined" label="Quantité" keyboardType="decimal-pad" value={String(item.quantity)} onChangeText={(value) => setQuantity(id, parseDecimal(value) || 0,!!companySettings.data?.allow_negative_stock)} /><IconButton mode="contained" icon="plus" accessibilityLabel="Augmenter la quantité" disabled={!companySettings.data?.allow_negative_stock&&item.quantity>=item.available} onPress={()=>setQuantity(id,item.quantity+1,!!companySettings.data?.allow_negative_stock)}/></View>
              {companySettings.data?.allow_discounts&&<TextInput style={styles.field} mode="outlined" label="Remise sur cette ligne" keyboardType="decimal-pad" value={String(item.discount)} onChangeText={value=>setDiscount(id,parseDecimal(value)||0)}/>}<Text>Total ligne : {formatMoney(item.salePrice * item.quantity-item.discount)}{!employee ? ` • Bénéfice : ${formatMoney((item.salePrice - item.purchasePrice) * item.quantity-item.discount)}` : ''}</Text>
            </Card.Content>
          </Card>
        );
      })}
      <Text variant="titleMedium">Client (facultatif)</Text>
      <SelectField
        label="Associer à un client"
        value={customerId}
        onChange={setCustomerId}
        options={[{ label: 'Client de passage', value: null }, ...(customers.data ?? []).filter((item) => item.is_active).map((item) => ({ label: item.name, value: item.id }))]}
      />
      <Text variant="titleMedium">Paiement</Text>
      {width >= 700 ? <SegmentedButtons value={payment} onValueChange={setPayment} buttons={[{ value: 'cash', label: 'Espèces' }, { value: 'mobile_money', label: 'Mobile Money' }, { value: 'credit', label: 'Crédit',disabled:companySettings.data?.allow_credit_sales===false }, { value: 'partial', label: 'Partiel',disabled:companySettings.data?.allow_credit_sales===false }]} /> : <View style={styles.paymentGrid}>{[
        ['cash','Espèces'],['mobile_money','Mobile Money'],['credit','Crédit'],['partial','Partiel'],
      ].map(([value,label])=><Chip key={value} selected={payment===value} disabled={(value==='credit'||value==='partial')&&companySettings.data?.allow_credit_sales===false} onPress={()=>setPayment(value)}>{label}</Chip>)}</View>}
      {(payment==='credit'||payment==='partial')&&<Card mode="outlined"><Card.Content style={styles.list}>{payment==='partial'&&<TextInput mode="outlined" label="Montant payé maintenant" keyboardType="decimal-pad" value={amountPaid} onChangeText={setAmountPaid}/>}<Text>{payment==='credit'?`Dette client : ${formatMoney(totals.total)}`:`Reste dû : ${formatMoney(Math.max(0,totals.total-(parseDecimal(amountPaid)||0)))}`}</Text>{!customerId&&<HelperText type="error" visible>Choisissez obligatoirement le client associé à cette dette.</HelperText>}</Card.Content></Card>}
      <Card mode="contained" style={[styles.checkout,{ backgroundColor: theme.colors.primaryContainer }]}>
        <Card.Content style={styles.checkoutContent}>
          <Icon source="cart-check" size={32} color={theme.colors.primary}/>
          <View style={styles.checkoutCopy}>
          <Text variant="headlineSmall">Total : {formatMoney(totals.total)}</Text>
          {totals.discount>0&&<Text>Remises : −{formatMoney(totals.discount)}</Text>}
          {totals.tax>0&&<Text>Taxes ({Number(companySettings.data?.tax_rate??0)} %) : {formatMoney(totals.tax)}</Text>}
          {!employee && <Text style={{ color: theme.colors.primary }}>Bénéfice brut : {formatMoney(totals.grossProfit)}</Text>}
          </View>
        </Card.Content>
      </Card>
      {!!save.error && <HelperText type="error" visible>{readableError(save.error)}</HelperText>}
      {discountTooHigh&&<HelperText type="error" visible>Une remise dépasse la limite de {Number(companySettings.data?.max_discount_percent??100)} % définie par l’administrateur.</HelperText>}
      <AppButton icon="check" loading={save.isPending} disabled={!items.length || !storeId || save.isPending || discountTooHigh || ((payment==='credit'||payment==='partial')&&!customerId) || (payment==='partial'&&(!(parseDecimal(amountPaid)>0)||parseDecimal(amountPaid)>=totals.total))} onPress={() => save.mutate()}>
        Enregistrer la vente
      </AppButton>
      </View>
      </View>
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  unavailable: { opacity: 0.72 },
  chip: { marginRight: 12 },
  field: { width: '100%', maxWidth: 320 },
  notice: { gap: 10 },
  categoryFilters: { flexDirection:'row', flexWrap:'wrap', gap:8 },
  quantityRow: { flexDirection:'row', alignItems:'center', gap:8 },
  quantityInput: { flex:1, maxWidth:180 },
  checkout: { borderRadius:22 },
  checkoutContent: { flexDirection:'row', alignItems:'center', gap:14 },
  checkoutCopy: { flex:1 },
  workspace: { gap: 18 },
  workspaceDesktop: { flexDirection: 'row', alignItems: 'flex-start' },
  catalogPane: { flex: 1, gap: 12, minWidth: 0 },
  cartPane: { gap: 12 },
  cartPaneDesktop: { width: 430 },
  emptyCart: { alignItems: 'center', gap: 6, paddingVertical: 20 },
  paymentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
