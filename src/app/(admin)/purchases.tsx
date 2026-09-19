import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { Card, HelperText, IconButton, Switch, TextInput } from 'react-native-paper';
import { SelectField } from '@/components/forms/SelectField';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/features/auth/AuthProvider';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import { getCashSummary } from '@/features/cash/api';
import { recordPurchase, type PurchaseLine } from '@/features/operations/api';
import { getProducts, getSuppliers } from '@/features/products/api';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatQuantity, parseDecimal, wholeOrNaN } from '@/utils/number';
import { WholeNumberInput } from '@/components/forms/WholeNumberInput';
import { invalidateOperationalSummaries } from '@/utils/queryInvalidation';
import { useSubscription } from '@/features/subscriptions/SubscriptionProvider';
import { AppSearchBar } from '@/components/ui/AppSearchBar';

export default function PurchasesScreen() {
  const { membership } = useAuth();
  const { formatMoney } = useCurrency();
  const { canUseFeature } = useSubscription();
  const cache = useQueryClient();
  const company = membership?.companyId ?? '';
  const store = membership?.storeId ?? '';
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const debouncedSearch = useDebouncedValue(productSearch);
  const [quantity, setQuantity] = useState('1');
  const [unitCost, setUnitCost] = useState('0');
  const [paid, setPaid] = useState(true);
  // Traçabilité (demande du 17/09) : l'app supposait implicitement un
  // paiement en espèces sans jamais le demander.
  const [paymentMethod, setPaymentMethod] = useState<'cash'|'mobile_money'|'card'|'bank_transfer'>('cash');
  const [items, setItems] = useState<PurchaseLine[]>([]);
  const [formError, setFormError] = useState('');
  const canCreateSupplierDebt = canUseFeature('supplier_debt');
  // Assoupli sur demande explicite du 17/09 : le propriétaire ou un
  // "Manager" (cash_transactions.override_negative_balance) peut passer
  // outre après confirmation explicite — un employé simple reste bloqué
  // sans recours, le serveur refuse de toute façon si cette condition
  // n'est pas remplie.
  const canOverrideNegative = membership?.role === 'company_admin' || !!membership?.permissions.includes('cash_transactions.override_negative_balance');
  const [confirmNegative, setConfirmNegative] = useState(false);

  const suppliers = useQuery({ queryKey: ['suppliers', company, store], queryFn: () => getSuppliers(company, store), enabled: !!store });
  const products = useQuery({ queryKey: ['purchase-products', company, store, debouncedSearch, 'cost'], queryFn: () => getProducts(company, store, debouncedSearch, null, true), enabled: !!store });
  const cashSummary = useQuery({ queryKey: ['cash-summary', store], queryFn: () => getCashSummary(store), enabled: !!store });
  const total = useMemo(() => items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0), [items]);
  // Payé maintenant seulement : une dette fournisseur ne touche pas la
  // caisse tout de suite, rien à avertir dans ce cas.
  const cashBalance = cashSummary.data?.balance ?? 0;
  const wouldGoNegative = paid && total > 0 && cashBalance - total < 0;

  // Demande explicite du propriétaire (17/09) : le bouton restait actif
  // quelle que soit la saisie (quantité négative, prix négatif refusé seulement après
  // le clic) — cette
  // même validation, calculée en direct plutôt qu'uniquement au clic,
  // désactive le bouton et affiche l'erreur avant toute tentative d'ajout.
  const parsedQuantityLive = wholeOrNaN(quantity);
  const parsedCostLive = parseDecimal(unitCost);
  const addError = !productId
    ? null
    : !(parsedQuantityLive > 0)
      ? 'La quantité doit être un nombre entier supérieur à zéro.'
      : !Number.isFinite(parsedCostLive) || parsedCostLive <= 0
        ? 'Le prix d’achat doit être supérieur à zéro.'
        : null;

  const add = () => {
    const product = products.data?.find((item) => item.id === productId);
    const parsedQuantity = wholeOrNaN(quantity);
    const parsedCost = parseDecimal(unitCost);
    if (!product) return setFormError('Sélectionnez un produit.');
    if (!(parsedQuantity > 0)) return setFormError('La quantité doit être un nombre entier supérieur à zéro.');
    if (!Number.isFinite(parsedCost) || parsedCost <= 0) return setFormError('Le prix d’achat doit être supérieur à zéro.');
    setFormError('');
    setItems((current) => {
      const existing = current.find((item) => item.productId === product.id);
      if (!existing) return [...current, { productId: product.id, name: product.name, quantity: parsedQuantity, unitCost: parsedCost }];
      return current.map((item) => item.productId === product.id
        ? { ...item, quantity: item.quantity + parsedQuantity, unitCost: parsedCost }
        : item);
    });
    setProductId(null);
    setQuantity('1');
    setUnitCost('0');
  };

  const mutation = useMutation({
    mutationFn: (options?: { confirmNegative?: boolean }) => recordPurchase(store, supplierId!, items, canCreateSupplierDebt ? paid : true, options?.confirmNegative, (canCreateSupplierDebt ? paid : true) ? paymentMethod : undefined),
    onSuccess: async () => {
      setItems([]);
      setSupplierId(null);
      setConfirmNegative(false);
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['stock-levels', company] }),
        cache.invalidateQueries({ queryKey: ['sale-stock', company, store] }),
        cache.invalidateQueries({ queryKey: ['supplier-stats', company, store] }),
        invalidateOperationalSummaries(cache, company, store),
      ]);
      router.replace('/suppliers' as never);
    },
  });

  return (
    <AdminPage title="Nouvel approvisionnement">
      <SelectField label="Fournisseur" value={supplierId} onChange={setSupplierId} options={(suppliers.data ?? []).filter((item) => item.is_active).map((item) => ({ label: item.name, value: item.id }))} />
      {!!suppliers.error && <HelperText type="error" visible>{suppliers.error.message}</HelperText>}
      <Card mode="outlined">
        <Card.Title title="Ajouter un produit" subtitle="Recherchez par nom ou code-barres" />
        <Card.Content style={{ gap: 10 }}>
          <AppSearchBar placeholder="Rechercher dans le catalogue" value={productSearch} onChangeText={setProductSearch} loading={productSearch !== debouncedSearch} />
          <SelectField label="Produit" value={productId} onChange={(value) => { setProductId(value); const product = products.data?.find((item) => item.id === value); if (product) setUnitCost(String(product.purchase_price ?? 0)); }} options={(products.data ?? []).filter((item) => item.is_active).map((item) => ({ label: item.name, value: item.id }))} />
          {!!products.error && <HelperText type="error" visible>{products.error.message}</HelperText>}
          <WholeNumberInput label="Quantité reçue" value={quantity} onChangeText={setQuantity} />
          <TextInput mode="outlined" label="Prix d’achat unitaire" accessibilityLabel="Prix d’achat unitaire" keyboardType="decimal-pad" selectTextOnFocus value={unitCost} onChangeText={setUnitCost} />
          {!!(formError||addError) && <HelperText type="error" visible>{formError||addError}</HelperText>}
          <AppButton mode="outlined" icon="plus" disabled={!productId||!!addError} onPress={add}>Ajouter à la commande</AppButton>
        </Card.Content>
      </Card>
      {items.map((item) => <Card key={item.productId} mode="contained"><Card.Title title={item.name} subtitle={`${formatQuantity(item.quantity)} × ${formatMoney(item.unitCost)}`} right={() => <IconButton icon="delete" accessibilityLabel={`Retirer ${item.name} de la commande`} onPress={() => setItems((rows) => rows.filter((row) => row.productId !== item.productId))} />} /></Card>)}
      <Card mode="contained"><Card.Title title={`Total : ${formatMoney(total)}`} subtitle={!canCreateSupplierDebt ? 'Paiement immédiat · les dettes fournisseurs nécessitent Pro' : paid ? 'Payé maintenant' : 'Dette fournisseur'} right={() => canCreateSupplierDebt ? <Switch value={paid} onValueChange={setPaid} accessibilityLabel="Payé maintenant" style={{ marginRight: 12 }} /> : null} /></Card>
      {(canCreateSupplierDebt ? paid : true) && <SelectField label="Moyen de paiement" value={paymentMethod} onChange={value=>setPaymentMethod((value??'cash') as typeof paymentMethod)} options={[{label:'Espèces',value:'cash'},{label:'Mobile Money',value:'mobile_money'},{label:'Carte',value:'card'},{label:'Virement',value:'bank_transfer'}]} />}
      {/* Audit externe (SM-01) : ce paiement était accepté même en dépassant
          la caisse actuelle, sans aucun avertissement. La caisse ne peut
          plus passer en négatif côté serveur par défaut ; un propriétaire
          ou un Manager peut néanmoins passer outre après confirmation
          explicite (demande du 17/09), un employé simple reste bloqué. */}
      {wouldGoNegative && <HelperText type="error" visible>{canOverrideNegative
        ? `Ce paiement dépasse la caisse actuelle (${formatMoney(cashBalance)}) : elle passera en négatif.${canCreateSupplierDebt ? ' Vous pouvez aussi basculer sur « Dette fournisseur » ci-dessus.' : ''}`
        : canCreateSupplierDebt
          ? `Ce paiement dépasse la caisse actuelle (${formatMoney(cashBalance)}). Basculez sur « Dette fournisseur » ci-dessus, ou réduisez le montant.`
          : `Ce paiement dépasse la caisse actuelle (${formatMoney(cashBalance)}). Ajoutez des fonds à la caisse avant de continuer, ou réduisez le montant.`}</HelperText>}
      {!!mutation.error && <HelperText type="error" visible>{mutation.error.message}</HelperText>}
      <AppButton icon="truck-check" loading={mutation.isPending} disabled={!store || !supplierId || !items.length || mutation.isPending || (wouldGoNegative && !canOverrideNegative)} onPress={() => { if (wouldGoNegative && canOverrideNegative) { setConfirmNegative(true); return; } mutation.mutate({}); }}>Confirmer la réception</AppButton>
      <ConfirmDialog
        visible={confirmNegative}
        title="Caisse insuffisante"
        message={`Ce paiement dépasse la caisse actuelle (${formatMoney(cashBalance)}) : elle passera en négatif. Continuer quand même ?`}
        loading={mutation.isPending}
        onCancel={() => setConfirmNegative(false)}
        onConfirm={() => mutation.mutate({ confirmNegative: true })}
      />
    </AdminPage>
  );
}
