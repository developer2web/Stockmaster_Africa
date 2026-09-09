import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { Card, HelperText, IconButton, Switch, TextInput } from 'react-native-paper';
import { SelectField } from '@/components/forms/SelectField';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { useAuth } from '@/features/auth/AuthProvider';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import { recordPurchase, type PurchaseLine } from '@/features/operations/api';
import { getProducts, getSuppliers } from '@/features/products/api';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatQuantity, parseDecimal } from '@/utils/number';
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
  const [items, setItems] = useState<PurchaseLine[]>([]);
  const [formError, setFormError] = useState('');
  const canCreateSupplierDebt = canUseFeature('supplier_debt');

  const suppliers = useQuery({ queryKey: ['suppliers', company, store], queryFn: () => getSuppliers(company, store), enabled: !!store });
  const products = useQuery({ queryKey: ['purchase-products', company, store, debouncedSearch, 'cost'], queryFn: () => getProducts(company, store, debouncedSearch, 0, true), enabled: !!store });
  const total = useMemo(() => items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0), [items]);

  const add = () => {
    const product = products.data?.find((item) => item.id === productId);
    const parsedQuantity = parseDecimal(quantity);
    const parsedCost = parseDecimal(unitCost);
    if (!product) return setFormError('Sélectionnez un produit.');
    if (!(parsedQuantity > 0)) return setFormError('La quantité doit être supérieure à zéro.');
    if (!Number.isFinite(parsedCost) || parsedCost < 0) return setFormError('Le prix d’achat est invalide.');
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
    mutationFn: () => recordPurchase(store, supplierId!, items, canCreateSupplierDebt ? paid : true),
    onSuccess: async () => {
      setItems([]);
      setSupplierId(null);
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
          <SelectField label="Produit" value={productId} onChange={(value) => { setProductId(value); const product = products.data?.find((item) => item.id === value); if (product) setUnitCost(String(product.purchase_price)); }} options={(products.data ?? []).filter((item) => item.is_active).map((item) => ({ label: item.name, value: item.id }))} />
          {!!products.error && <HelperText type="error" visible>{products.error.message}</HelperText>}
          <TextInput mode="outlined" label="Quantité reçue" keyboardType="decimal-pad" value={quantity} onChangeText={setQuantity} />
          <TextInput mode="outlined" label="Prix d’achat unitaire" keyboardType="decimal-pad" value={unitCost} onChangeText={setUnitCost} />
          {!!formError && <HelperText type="error" visible>{formError}</HelperText>}
          <AppButton mode="outlined" icon="plus" onPress={add}>Ajouter à la commande</AppButton>
        </Card.Content>
      </Card>
      {items.map((item) => <Card key={item.productId} mode="contained"><Card.Title title={item.name} subtitle={`${formatQuantity(item.quantity)} × ${formatMoney(item.unitCost)}`} right={() => <IconButton icon="delete" onPress={() => setItems((rows) => rows.filter((row) => row.productId !== item.productId))} />} /></Card>)}
      <Card mode="contained"><Card.Title title={`Total : ${formatMoney(total)}`} subtitle={!canCreateSupplierDebt ? 'Paiement immédiat · les dettes fournisseurs nécessitent Pro' : paid ? 'Payé maintenant' : 'Dette fournisseur'} right={() => canCreateSupplierDebt ? <Switch value={paid} onValueChange={setPaid} style={{ marginRight: 12 }} /> : null} /></Card>
      {!!mutation.error && <HelperText type="error" visible>{mutation.error.message}</HelperText>}
      <AppButton icon="truck-check" loading={mutation.isPending} disabled={!store || !supplierId || !items.length || mutation.isPending} onPress={() => mutation.mutate()}>Confirmer la réception</AppButton>
    </AdminPage>
  );
}
