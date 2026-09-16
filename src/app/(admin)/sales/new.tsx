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
import { AppFeedback } from '@/components/ui/AppFeedback';
import { ProductThumbnail } from '@/components/products/ProductThumbnail';
import { getCheckoutCustomers } from '@/features/customers/api';
import { getCompany } from '@/features/employees/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { createSale, getSaleStock } from '@/features/sales/api';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import { cartKey, useSaleCart } from '@/stores/saleCart';
import { reservedElsewhere } from '@/stores/saleCartLogic';
import { formatQuantity, parseDecimal, digitsOnly } from '@/utils/number';
import { useOffline } from '@/features/offline/OfflineProvider';
import { invalidateOperationalSummaries } from '@/utils/queryInvalidation';
import { AppSearchBar } from '@/components/ui/AppSearchBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { createOperationId } from '@/utils/operationId';
import { readableError } from '@/utils/errors';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { plural } from '@/utils/plural';

const unitLabels: Record<string, string> = { piece: 'Pièce', carton: 'Carton', kg: 'kg', litre: 'Litre', sac: 'Sac', paquet: 'Paquet' };
const unitLabel = (unit: string) => unitLabels[unit] ?? unit;

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
  const { items, add, setQuantity, setDiscount, remove, autoClearedAt, acknowledgeAutoClear } = useSaleCart();
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

  // Le panier se vide tout seul après 5 minutes sans y toucher (voir
  // src/stores/saleCart.ts) : on remet l'écran à l'état initial pour ne
  // pas laisser l'utilisateur sur une étape de paiement devenue vide.
  useEffect(() => {
    if (autoClearedAt === null) return;
    setQuantityDrafts({});
    setStep('products');
    setCustomerId(null);
    setPayment('cash');
    setAmountPaid('');
  }, [autoClearedAt]);

  const matchingProducts = useMemo(()=>{
    const term=debouncedSearch.trim().toLocaleLowerCase('fr');
    return (stock.data ?? []).filter(item=>(!term||item.name.toLocaleLowerCase('fr').includes(term)||item.lookupCodes?.some(code=>code.toLocaleLowerCase('fr').includes(term))));
  },[debouncedSearch,stock.data]);
  const shown = matchingProducts.slice(0, visibleCount);
  useEffect(() => { setVisibleCount(30); }, [debouncedSearch]);
  const totals = useMemo(() => {
    const subtotal=items.reduce((sum, item) => sum + item.salePrice * item.quantity, 0);
    const discount=items.reduce((sum,item)=>sum+item.discount,0);
    return ({
    subtotal,
    discount,
    total: subtotal-discount,
    grossProfit: items.reduce(
      (sum, item) => sum + (item.salePrice - item.purchasePrice) * item.quantity-item.discount,
      0,
    ),
  })}, [items]);
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
  const changeQuantity = (id: string, rawInput: string, available: number) => {
    const raw = digitsOnly(rawInput);
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
      <View style={styles.grid}>
        {shown.map((item) => {
          const available = item.available > 0 || !!companySettings.data?.allow_negative_stock;
          const inCartUnit = items.find(cartItem => cartKey(cartItem) === cartKey({ ...item, saleMode: 'unit' }));
          const inCartBulk = item.bulkUnitLabel ? items.find(cartItem => cartKey(cartItem) === cartKey({ ...item, saleMode: 'bulk' })) : undefined;
          const addOne = (mode: 'unit' | 'bulk' = 'unit') => { add(item,!!companySettings.data?.allow_negative_stock,mode); setQuantityDrafts(current => { const next = { ...current }; delete next[cartKey({ ...item, saleMode: mode })]; return next; }); };
          const anyInCart = !!inCartUnit || !!inCartBulk;
          // Les produits vendus aussi en gros ont besoin de deux boutons
          // explicites (détail / pack) : ils gardent une carte large en
          // pleine ligne. Les produits simples passent en tuiles compactes
          // façon Amazon, plusieurs par ligne.
          if (item.bulkUnitLabel) {
            return (
              <Card key={cartKey(item)} mode="contained" style={[styles.gridCardBulk, { backgroundColor: theme.colors.surface }, !available && styles.unavailable, anyInCart && { borderColor: theme.colors.primary, borderWidth: 1.5 }]}>
                <Card.Content style={styles.productRow}>
                  <ProductThumbnail url={item.imageUrl} />
                  <View style={styles.productCopy}><Text variant="titleMedium">{item.name}</Text><Text>{formatMoney(item.salePrice)} ({unitLabel(item.unit)})</Text>
                    <Text style={{ color: available ? theme.colors.onSurfaceVariant : theme.colors.error }}>{available ? `Stock : ${formatQuantity(item.available)}` : 'Stock épuisé'}</Text>
                  </View>
                </Card.Content>
                <Card.Content style={styles.bulkButtons}>
                  <AppButton mode={inCartUnit?'contained':'outlined'} compact disabled={!available || save.isPending} onPress={() => addOne('unit')}>
                    {inCartUnit ? `✓ ${formatQuantity(inCartUnit.quantity)} ${unitLabel(item.unit)}${plural(inCartUnit.quantity)}` : `+1 ${unitLabel(item.unit)} (${formatMoney(item.salePrice)})`}
                  </AppButton>
                  <AppButton mode={inCartBulk?'contained':'outlined'} compact disabled={!available || save.isPending} onPress={() => addOne('bulk')}>
                    {inCartBulk ? `✓ ${formatQuantity(inCartBulk.quantity / (item.bulkQuantity ?? 1))} ${item.bulkUnitLabel}` : `+1 ${item.bulkUnitLabel} (${formatMoney(item.bulkPrice ?? 0)})`}
                  </AppButton>
                </Card.Content>
                {!available && <Card.Content><Text style={{ color: theme.colors.error }}>Ajoutez le stock depuis la fiche Produit ou le module Stock.</Text></Card.Content>}
              </Card>
            );
          }
          return (
            <Card key={cartKey(item)} mode="contained" style={[styles.gridCard, { backgroundColor: theme.colors.surface }, !available && styles.unavailable, anyInCart && { borderColor: theme.colors.primary, borderWidth: 1.5 }]} onPress={available && !save.isPending && !inCartUnit ? () => addOne('unit') : undefined}>
              <View style={styles.gridImageWrap}>
                <ProductThumbnail url={item.imageUrl} size={94} />
              </View>
              <Card.Content style={styles.gridCopy}>
                <Text variant="bodyMedium" numberOfLines={2} style={styles.gridName}>{item.name}</Text>
                <Text variant="titleMedium" style={styles.bold}>{formatMoney(item.salePrice)}</Text>
                {!available && <Text variant="labelSmall" style={{ color: theme.colors.error }}>Épuisé</Text>}
              </Card.Content>
              <View style={styles.gridActions}>
                {inCartUnit ? (
                  <View style={styles.gridStepper}>
                    <IconButton mode="outlined" icon="minus" size={16} disabled={save.isPending} accessibilityLabel={`Retirer un ${item.name}`} onPress={(event) => { event.stopPropagation(); setQuantity(cartKey(inCartUnit), inCartUnit.quantity - 1, !!companySettings.data?.allow_negative_stock); }} />
                    <Text variant="titleSmall" style={styles.bold}>{formatQuantity(inCartUnit.quantity)}</Text>
                    <IconButton mode="contained" icon="plus" size={16} disabled={!available || save.isPending} accessibilityLabel={`Ajouter encore un ${item.name}`} onPress={(event) => { event.stopPropagation(); addOne('unit'); }} />
                  </View>
                ) : (
                  <IconButton mode="contained" icon="plus" size={18} disabled={!available || save.isPending} accessibilityLabel={`Ajouter ${item.name}`} onPress={(event) => { event.stopPropagation(); addOne('unit'); }} />
                )}
              </View>
            </Card>
          );
        })}
        {shown.length < matchingProducts.length && <AppButton mode="outlined" onPress={() => setVisibleCount(value => value + 30)}>Afficher plus d’articles ({shown.length}/{matchingProducts.length})</AppButton>}
        {!stock.isLoading && !shown.length && <EmptyState icon="package-variant" title="Aucun produit trouvé" message="Modifiez ou effacez la recherche."/>}
      </View>
      </View>}
      {(desktop || step === 'checkout') && <View style={[styles.cartPane, desktop && styles.cartPaneDesktop]}>
      <Text variant="headlineSmall">Panier ({items.length})</Text>
      {!!items.length && <AppButton mode="text" icon="cart-remove" disabled={save.isPending} onPress={() => setConfirmClear(true)}>Vider le panier</AppButton>}
      {issue && <HelperText type="info" visible accessibilityLiveRegion="polite">{issue}</HelperText>}
      {!!companySettings.error && <AppButton mode="text" onPress={() => void companySettings.refetch()}>Recharger les règles de vente</AppButton>}
      {!desktop && <AppButton mode="text" icon="plus" onPress={() => setStep('products')}>Ajouter des articles</AppButton>}
      {!!items.length && companySettings.data?.allow_discounts && <AppButton mode="text" icon="percent" onPress={() => setShowDiscounts(value => !value)}>{showDiscounts ? 'Masquer les remises' : 'Appliquer une remise'}</AppButton>}
      {!!items.length && companySettings.data && !companySettings.data.allow_discounts && !employee && <HelperText type="info" visible>Les remises sont désactivées pour cette entreprise. Activez-les depuis Entreprise (Plus &gt; Boutique) pour les proposer ici.</HelperText>}
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
        const isBulk = item.saleMode === 'bulk';
        const bulkStep = Number(item.bulkQuantity ?? 1);
        const packCount = isBulk ? item.quantity / bulkStep : 0;
        const allowNegative = !!companySettings.data?.allow_negative_stock;
        return (
          <Card key={id} mode="contained" style={{ backgroundColor: theme.colors.surface }}>
            <Card.Content style={styles.productRow}>
              <ProductThumbnail url={item.imageUrl} />
              <View style={styles.productCopy}>
                <Text variant="titleMedium">{item.name}{isBulk ? ` · ${item.bulkUnitLabel}` : ''}</Text>
                <Text>{formatMoney(item.salePrice)} {isBulk ? `par ${unitLabel(item.unit)}` : ''}</Text>
                <Text>Disponible : {formatQuantity(item.available)} {item.unit}</Text>
              </View>
              <IconButton icon="delete" accessibilityLabel={`Retirer ${item.name} du panier`} onPress={() => { remove(id); setQuantityDrafts(current => { const next = { ...current }; delete next[id]; return next; }); }} />
            </Card.Content>
            <Card.Content style={styles.list}>
              {isBulk ? (
                <View style={styles.quantityRow}>
                  <IconButton mode="outlined" icon="minus" accessibilityLabel={`Diminuer d’un ${item.bulkUnitLabel}`} disabled={packCount<=1} onPress={()=>setQuantity(id,item.quantity-bulkStep,allowNegative)}/>
                  <Text variant="titleMedium" style={styles.quantityInput}>{formatQuantity(packCount)} {item.bulkUnitLabel}{plural(packCount)} ({formatQuantity(item.quantity)} {unitLabel(item.unit)}{plural(item.quantity)})</Text>
                  <IconButton mode="contained" icon="plus" accessibilityLabel={`Ajouter un ${item.bulkUnitLabel}`} disabled={!allowNegative&&item.quantity+bulkStep>item.available-reservedElsewhere(items,item,'bulk')} onPress={()=>setQuantity(id,item.quantity+bulkStep,allowNegative)}/>
                </View>
              ) : (
                <View style={styles.quantityRow}><IconButton mode="outlined" icon="minus" accessibilityLabel="Diminuer la quantité" disabled={item.quantity<=1} onPress={()=>changeQuantity(id,String(item.quantity-1),item.available)}/><TextInput style={styles.quantityInput} mode="outlined" label="Quantité" accessibilityLabel="Quantité" keyboardType="number-pad" selectTextOnFocus value={quantityDrafts[id] ?? String(item.quantity)} onChangeText={(value) => changeQuantity(id, value, item.available)} /><IconButton mode="contained" icon="plus" accessibilityLabel="Augmenter la quantité" disabled={!allowNegative&&item.quantity>=item.available-reservedElsewhere(items,item,'unit')} onPress={()=>changeQuantity(id,String(item.quantity+1),item.available)}/></View>
              )}
              {companySettings.data?.allow_discounts&&showDiscounts&&<TextInput style={styles.field} mode="outlined" label="Remise sur cette ligne" accessibilityLabel="Remise sur cette ligne" keyboardType="decimal-pad" selectTextOnFocus value={String(item.discount)} onChangeText={value=>setDiscount(id,parseDecimal(value)||0)}/>}<Text>Total ligne : {formatMoney(item.salePrice * item.quantity-item.discount)}</Text>
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
      {(payment==='credit'||payment==='partial')&&<Card mode="outlined"><Card.Content style={styles.list}>{payment==='partial'&&<TextInput mode="outlined" label="Montant payé maintenant" accessibilityLabel="Montant payé maintenant" keyboardType="decimal-pad" selectTextOnFocus value={amountPaid} onChangeText={setAmountPaid}/>}<Text>{payment==='credit'?`Dette client : ${formatMoney(totals.total)}`:`Reste dû : ${formatMoney(Math.max(0,totals.total-(parseDecimal(amountPaid)||0)))}`}</Text>{!customerId&&<HelperText type="error" visible>Choisissez obligatoirement le client associé à cette dette.</HelperText>}</Card.Content></Card>}
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
      <AppFeedback message={autoClearedAt ? 'Panier vidé automatiquement après 5 minutes sans activité.' : ''} type="info" onDismiss={acknowledgeAutoClear} offsetBottom={76} />
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  productRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  productCopy: { flex: 1, minWidth: 0, gap: 4 },
  inCartBadge: { alignItems: 'center', gap: 2 },
  bulkButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 0 },
  list: { gap: 8 },
  unavailable: { opacity: 0.72 },
  bold: { fontWeight: '800' },
  // Grille façon Amazon pour les produits simples : flexBasis en pixels
  // fixes (pas en %) pour que le nombre de colonnes s'adapte tout seul à la
  // largeur de l'écran (3 sur téléphone, davantage sur un écran large).
  // C'est flexBasis (pas minWidth) que le passage à la ligne utilise pour
  // décider combien tiennent par rangée — flexBasis doit donc rester assez
  // bas pour que 3 tiennent sur ~351px de contenu utile (iPhone SE, l'écran
  // le plus étroit couramment encore utilisé) ; minWidth ne sert qu'à
  // empêcher une carte de trop rétrécir une fois la rangée décidée.
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gridCard: { flexBasis: 111, flexGrow: 1, minWidth: 106, maxWidth: 210, overflow: 'hidden' },
  // Les produits vendus aussi en gros gardent une carte large (deux
  // boutons + texte) : elle prend toute la ligne sur téléphone et se
  // partage la ligne avec une autre sur un écran large.
  gridCardBulk: { flexBasis: 260, flexGrow: 1, minWidth: 240, overflow: 'hidden' },
  gridImageWrap: { alignItems: 'center', paddingTop: 14, paddingBottom: 4 },
  gridCopy: { alignItems: 'center', gap: 3, paddingTop: 2, paddingHorizontal: 10 },
  gridName: { textAlign: 'center' },
  // Contrôle d'ajout tout en bas de la carte, jamais sur la photo : un
  // simple + tant que le produit n'est pas au panier, un vrai stepper
  // (− quantité +) une fois ajouté — inspiré des grilles d'achat rapide
  // plutôt que de la fiche produit Amazon, mieux adapté à la vente.
  gridActions: { alignItems: 'center', justifyContent: 'center', paddingBottom: 8, paddingTop: 4 },
  gridStepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingHorizontal: 2 },
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
