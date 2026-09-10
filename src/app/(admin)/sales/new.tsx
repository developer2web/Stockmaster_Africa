import { SaleCustomerPicker } from '@/components/customers/SaleCustomerPicker';
import { checkoutIssue } from '@/features/sales/checkout';
import { PendingSales } from '@/features/offline/PendingSales';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Card, Chip, HelperText, Icon, IconButton, SegmentedButtons, Text, TextInput, useTheme } from 'react-native-paper';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { ProductThumbnail } from '@/components/products/ProductThumbnail';
import { getCheckoutCustomers } from '@/features/customers/api';
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
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

export default function NewSale() {
  const { formatMoney } = useCurrency();
  const { productId, variantId, scanToken } = useLocalSearchParams<{ productId?: string; variantId?: string; scanToken?: string }>();
  const { membership, offlineAuthenticated } = useAuth();
  const theme = useTheme();
  const { fontScale } = useWindowDimensions();
  const [contentWidth, setContentWidth] = useState(0);
  const desktop = contentWidth >= 1000 * Math.max(1, fontScale);
  const company = membership?.companyId ?? '';
  const employee = membership?.role === 'employee';
  const storeId = membership?.storeId ?? '';
  const [queuedSale, setQueuedSale] = useState<{ reference: string; total: number } | null>(null);
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>({});
  const [confirmClear, setConfirmClear] = useState(false);
  const [step, setStep] = useState('products');
  const [showCustomer, setShowCustomer] = useState(false);
  const [showDiscounts, setShowDiscounts] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch=useDebouncedValue(search,120);
  const [visibleCount, setVisibleCount] = useState(30);
  const [payment, setPayment] = useState('cash');
  const [amountPaid, setAmountPaid] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const cache = useQueryClient();
  const { refreshQueue } = useOffline();
  const { items, add, setQuantity, setDiscount, remove } = useSaleCart();
  const processedScan = useRef<string|null>(null);
  const operationId=useRef(createOperationId());
  const stock = useQuery({
    queryKey: ['sale-stock', company, storeId, employee],
    queryFn: () => getSaleStock(company, storeId, !employee),
    enabled: !!company && !!storeId,
  });
  useQuery({
    queryKey: ['checkout-customers', company],
    queryFn: () => getCheckoutCustomers(company),
    enabled: !!company,
  });
  const companySettings=useQuery({queryKey:['company',company],queryFn:()=>getCompany(company),enabled:!!company});

  useEffect(() => {
    const token=scanToken??`${productId??''}:${variantId??''}`;
    if (processedScan.current===token || !productId || !stock.data) return;
    const found = stock.data.find((item) =>
      item.productId === productId && (!variantId || item.variantId === variantId));
    if (found && (found.available > 0 || companySettings.data?.allow_negative_stock)) {
      add(found,!!companySettings.data?.allow_negative_stock);
      setQuantityDrafts(current => { const next = { ...current }; delete next[cartKey(found)]; return next; });
      processedScan.current = token;
    }
  }, [productId, variantId, scanToken, stock.data, companySettings.data?.allow_negative_stock, add]);

  const matchingProducts = useMemo(()=>{
    const term=debouncedSearch.trim().toLocaleLowerCase('fr');
    return (stock.data ?? []).filter(item=>(!term||item.name.toLocaleLowerCase('fr').includes(term)||item.lookupCodes?.some(code=>code.toLocaleLowerCase('fr').includes(term))));
  },[debouncedSearch,stock.data]);
  const shown = matchingProducts.slice(0, visibleCount);
  useEffect(() => { setVisibleCount(30); }, [debouncedSearch]);
  const totals = useMemo(() => {
    const subtotal=items.reduce((sum, item) => sum + item.salePrice * item.quantity, 0);
    const discount=items.reduce((sum,item)=>sum+item.discount,0);
    const tax=Math.round((subtotal-discount)*Number(companySettings.data?.tax_rate??0))/100;
    return ({
    subtotal,
    discount,
    tax,
    total: subtotal-discount,
    grossProfit: items.reduce(
      (sum, item) => sum + (item.salePrice - item.purchasePrice) * item.quantity-item.discount,
      0,
    ),
  })}, [companySettings.data?.tax_rate, items]);
  const discountTooHigh=items.some(item=>item.discount>item.salePrice*item.quantity*Number(companySettings.data?.max_discount_percent??100)/100);
  const save = useMutation({
    mutationFn: () => createSale(company, storeId, payment, items, customerId, payment==='credit'?0:payment==='partial'?parseDecimal(amountPaid):totals.total,operationId.current,!!companySettings.data?.allow_negative_stock,totals.total),
    onSuccess: async (result) => {
      useSaleCart.getState().clear();
      operationId.current = createOperationId();
      processedScan.current = null;
      router.setParams({ productId: undefined, variantId: undefined, scanToken: undefined });
      setQuantityDrafts({});
      setCustomerId(null);
      setAmountPaid('');
      setPayment('cash');
      setStep('products');
      setShowCustomer(false);
      setShowDiscounts(false);
      if (result.queued) {
        setQueuedSale({ reference: result.reference, total: result.total });
        await refreshQueue().catch(() => undefined);
        return;
      }
      await Promise.allSettled([
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
  const invalidQuantity = items.some(item => {
    const raw = quantityDrafts[cartKey(item)];
    if (raw === undefined) return false;
    const quantity = parseDecimal(raw);
    return !Number.isFinite(quantity) || quantity <= 0 || (!companySettings.data?.allow_negative_stock && quantity > item.available);
  });
  const changeQuantity = (id: string, raw: string, available: number) => {
    setQuantityDrafts(current => ({ ...current, [id]: raw }));
    const quantity = parseDecimal(raw);
    if (Number.isFinite(quantity) && quantity > 0 && (companySettings.data?.allow_negative_stock || quantity <= available)) setQuantity(id, quantity, !!companySettings.data?.allow_negative_stock);
  };
  const issue = checkoutIssue({
    invalidQuantity,
    itemCount: items.length, storeId, pending: save.isPending,
    settingsReady: !!companySettings.data && !companySettings.error,
    discountTooHigh, payment, customerId, amountPaid: parseDecimal(amountPaid), total: totals.total,
    creditAllowed: companySettings.data?.allow_credit_sales !== false,
  });
  const checkoutDisabled = issue !== null;
  if (queuedSale) return <AdminPage title="Vente conservée sur cet appareil" description="L’envoi doit encore être confirmé par le serveur.">
    <Card mode="contained"><Card.Content style={styles.list}>
      <Text variant="headlineSmall">{formatMoney(queuedSale.total)}</Text><Text>{queuedSale.reference}</Text>
      <Text>Cette vente a été sauvegardée localement. Consultez le suivi pour connaître son état actuel.</Text>
    </Card.Content></Card>
    <PendingSales />
    <AppButton icon="cart-plus" onPress={() => { setQueuedSale(null); save.reset(); }}>Nouvelle vente</AppButton>
    <AppButton mode="outlined" icon="sync" onPress={() => router.push('/(settings)/offline')}>Voir le suivi</AppButton>
    <Text>Le reçu définitif sera disponible dans l’historique après confirmation du serveur. Ne recréez pas cette vente.</Text>
  </AdminPage>;

  return (
    <AdminPage
      title="Nouvelle vente"
      onContentWidthChange={setContentWidth}
      description="Choisissez les articles, puis vérifiez le panier et le paiement."
      scrollResetKey={step}
      action={<AppButton mode="outlined" icon="barcode-scan" onPress={() => router.push({ pathname: (employee ? '/employee/scanner' : '/scanner') as never, params: { mode: 'sale' } })}>Scanner</AppButton>}
      floatingAction={!desktop && step === 'products' ? <AppButton icon="cart-outline" style={{ alignSelf: 'stretch' }} disabled={!items.length} onPress={() => setStep('checkout')}>Panier · {formatMoney(totals.total)}</AppButton> : <AppButton style={!desktop ? { alignSelf: 'stretch' } : undefined} icon="cash-register" loading={save.isPending} disabled={checkoutDisabled} onPress={() => save.mutate()}>{save.isPending ? 'Enregistrement…' : payment === 'credit' ? 'Enregistrer le crédit' : `Valider · ${formatMoney(totals.total)}`}</AppButton>}
    >
      {offlineAuthenticated && <Card mode="contained" style={{ backgroundColor: theme.colors.primaryContainer }}><Card.Content style={styles.notice}><Chip icon="wifi-off">Vente hors ligne</Chip><Text style={{ color: theme.colors.onPrimaryContainer }}>{membership?.companyName} · {membership?.storeName ?? 'Boutique'} · Produits, prix, stock et clients préchargés</Text></Card.Content></Card>}
      {!desktop && <SegmentedButtons value={step} onValueChange={setStep} buttons={[
        { value: 'products', label: '1. Articles', icon: 'package-variant' },
        { value: 'checkout', label: `2. Panier (${items.length})`, icon: 'cart-outline' },
      ]} />}
      <View pointerEvents={save.isPending ? 'none' : 'auto'} style={[styles.workspace, desktop && styles.workspaceDesktop]}>
      {(desktop || step === 'products') && <View style={styles.catalogPane}>
      <Text style={{ color: theme.colors.onSurfaceVariant }}>Touchez un article pour l’ajouter au panier, ou scannez son code-barres.</Text>
      <AppSearchBar placeholder="Nom ou code-barres" value={search} onChangeText={setSearch} loading={search!==debouncedSearch} />
      {stock.isLoading && <Text>Chargement des articles…</Text>}
      {!!stock.error && <HelperText type="error" visible>{readableError(stock.error)}</HelperText>}
      <View style={styles.list}>
        {shown.map((item) => {
          const available = item.available > 0 || !!companySettings.data?.allow_negative_stock;
          return (
            <Card key={cartKey(item)} mode="contained" style={[{ backgroundColor: theme.colors.surface }, !available && styles.unavailable]} onPress={available && !save.isPending ? () => { add(item,!!companySettings.data?.allow_negative_stock); setQuantityDrafts(current => { const next = { ...current }; delete next[cartKey(item)]; return next; }); } : undefined}>
              <Card.Content style={styles.productRow}>
                <ProductThumbnail url={item.imageUrl} />
                <View style={styles.productCopy}><Text variant="titleMedium">{item.name}</Text><Text>{formatMoney(item.salePrice)}</Text>
                  <Text style={{ color: available ? theme.colors.onSurfaceVariant : theme.colors.error }}>{available ? `Stock : ${formatQuantity(item.available)}` : 'Stock épuisé'}</Text>
                </View>
              </Card.Content>
              {!available && <Card.Content><Text style={{ color: theme.colors.error }}>Ajoutez le stock depuis la fiche Produit ou le module Stock.</Text></Card.Content>}
            </Card>
          );
        })}
        {shown.length < matchingProducts.length && <AppButton mode="outlined" onPress={() => setVisibleCount(value => value + 30)}>Afficher plus d’articles ({shown.length}/{matchingProducts.length})</AppButton>}
        {!stock.isLoading && !shown.length && <EmptyState icon="package-variant" title="Aucun produit trouvé" message="Modifiez ou effacez la recherche."/>}
      </View>
      </View>}
      {(desktop || step === 'checkout') && <View style={[styles.cartPane, desktop && styles.cartPaneDesktop]}>
      <Text variant="headlineSmall">Panier ({items.length})</Text>
      {!!items.length && <AppButton mode="text" destructive icon="cart-remove" disabled={save.isPending} onPress={() => setConfirmClear(true)}>Vider le panier</AppButton>}
      {issue && <HelperText type="info" visible accessibilityLiveRegion="polite">{issue}</HelperText>}
      {!!companySettings.error && <AppButton mode="text" onPress={() => void companySettings.refetch()}>Recharger les règles de vente</AppButton>}
      {!desktop && <AppButton mode="text" icon="plus" onPress={() => setStep('products')}>Ajouter des articles</AppButton>}
      {!!items.length && companySettings.data?.allow_discounts && <AppButton mode="text" icon="percent" onPress={() => setShowDiscounts(value => !value)}>{showDiscounts ? 'Masquer les remises' : 'Appliquer une remise'}</AppButton>}
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
            <Card.Content style={styles.productRow}>
              <ProductThumbnail url={item.imageUrl} />
              <View style={styles.productCopy}><Text variant="titleMedium">{item.name}</Text><Text>{formatMoney(item.salePrice)}</Text><Text>Disponible : {formatQuantity(item.available)} {item.unit}</Text></View>
              <IconButton icon="delete" accessibilityLabel={`Retirer ${item.name} du panier`} onPress={() => { remove(id); setQuantityDrafts(current => { const next = { ...current }; delete next[id]; return next; }); }} />
            </Card.Content>
            <Card.Content style={styles.list}>
              <View style={styles.quantityRow}><IconButton mode="outlined" icon="minus" accessibilityLabel="Diminuer la quantité" disabled={item.quantity<=1} onPress={()=>changeQuantity(id,String(item.quantity-1),item.available)}/><TextInput style={styles.quantityInput} mode="outlined" label="Quantité" keyboardType="decimal-pad" value={quantityDrafts[id] ?? String(item.quantity)} onChangeText={(value) => changeQuantity(id, value, item.available)} /><IconButton mode="contained" icon="plus" accessibilityLabel="Augmenter la quantité" disabled={!companySettings.data?.allow_negative_stock&&item.quantity>=item.available} onPress={()=>changeQuantity(id,String(item.quantity+1),item.available)}/></View>
              {companySettings.data?.allow_discounts&&showDiscounts&&<TextInput style={styles.field} mode="outlined" label="Remise sur cette ligne" keyboardType="decimal-pad" value={String(item.discount)} onChangeText={value=>setDiscount(id,parseDecimal(value)||0)}/>}<Text>Total ligne : {formatMoney(item.salePrice * item.quantity-item.discount)}</Text>
            </Card.Content>
          </Card>
        );
      })}
      <Text variant="titleMedium">Paiement</Text>
      {<View style={styles.paymentGrid}>{[
        ['cash','Espèces'],['mobile_money','Mobile Money'],['credit','Crédit'],['partial','Acompte'],
      ].map(([value,label])=><Chip key={value} selected={payment===value} disabled={(value==='credit'||value==='partial')&&companySettings.data?.allow_credit_sales===false} onPress={()=>setPayment(value)}>{label}</Chip>)}</View>}
      {(payment === 'credit' || payment === 'partial' || showCustomer || customerId) ? <View style={styles.list}>
        <SaleCustomerPicker companyId={company} value={customerId} onChange={setCustomerId} required={payment === 'credit' || payment === 'partial'} />
        {payment !== 'credit' && payment !== 'partial' && <AppButton mode="text" onPress={() => { setCustomerId(null); setShowCustomer(false); }}>Continuer sans client</AppButton>}
      </View> : <AppButton mode="text" icon="account-plus-outline" onPress={() => setShowCustomer(true)}>Associer un client (facultatif)</AppButton>}
      {(payment==='credit'||payment==='partial')&&<Card mode="outlined"><Card.Content style={styles.list}>{payment==='partial'&&<TextInput mode="outlined" label="Montant payé maintenant" keyboardType="decimal-pad" value={amountPaid} onChangeText={setAmountPaid}/>}<Text>{payment==='credit'?`Dette client : ${formatMoney(totals.total)}`:`Reste dû : ${formatMoney(Math.max(0,totals.total-(parseDecimal(amountPaid)||0)))}`}</Text>{!customerId&&<HelperText type="error" visible>Choisissez obligatoirement le client associé à cette dette.</HelperText>}</Card.Content></Card>}
      <Card mode="contained" style={[styles.checkout,{ backgroundColor: theme.colors.primaryContainer }]}>
        <Card.Content style={styles.checkoutContent}>
          <Icon source="cart-check" size={32} color={theme.colors.primary}/>
          <View style={styles.checkoutCopy}>
          <Text variant="headlineSmall">Total : {formatMoney(totals.total)}</Text>
          {totals.discount>0&&<Text>Remises : −{formatMoney(totals.discount)}</Text>}

          </View>
        </Card.Content>
      </Card>
      {!!save.error && <HelperText type="error" visible>{readableError(save.error)}</HelperText>}
      {discountTooHigh&&<HelperText type="error" visible>Une remise dépasse la limite de {Number(companySettings.data?.max_discount_percent??100)} % définie par l’administrateur.</HelperText>}
      </View>}
      </View>
      <ConfirmDialog visible={confirmClear} title="Vider le panier ?" message="Les articles et remises de cette vente non validée seront retirés. Aucune vente enregistrée ne sera modifiée." destructive onCancel={() => setConfirmClear(false)} onConfirm={() => { useSaleCart.getState().clear(); setQuantityDrafts({}); setConfirmClear(false); setStep('products'); setCustomerId(null); setPayment('cash'); setAmountPaid(''); }} />
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  productRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  productCopy: { flex: 1, minWidth: 0, gap: 4 },
  list: { gap: 8 },
  unavailable: { opacity: 0.72 },
  chip: { marginRight: 12 },
  field: { width: '100%', maxWidth: 320 },
  notice: { gap: 10 },
  quantityRow: { flexDirection:'row', alignItems:'center', gap:8 },
  quantityInput: { flex:1, maxWidth:180 },
  checkout: { borderRadius:22 },
  checkoutContent: { flexDirection:'row', alignItems:'center', gap:14 },
  checkoutCopy: { flex:1 },
  workspace: { gap: 18 },
  workspaceDesktop: { flexDirection: 'row', alignItems: 'flex-start' },
  catalogPane: { flex: 1, gap: 12, minWidth: 0 },
  cartPane: { gap: 12 },
  cartPaneDesktop: { width: 400, flexShrink: 0 },
  emptyCart: { alignItems: 'center', gap: 6, paddingVertical: 20 },
  paymentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
