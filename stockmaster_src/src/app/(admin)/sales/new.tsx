import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Chip, HelperText, IconButton, Searchbar, SegmentedButtons, Text, TextInput, useTheme } from 'react-native-paper';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { ProductThumbnail } from '@/components/products/ProductThumbnail';
import { useAuth } from '@/features/auth/AuthProvider';
import { createSale, getSaleStock } from '@/features/sales/api';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import { cartKey, useSaleCart } from '@/stores/saleCart';

export default function NewSale() {
  const { formatMoney } = useCurrency();
  const { productId, variantId } = useLocalSearchParams<{ productId?: string; variantId?: string }>();
  const { membership } = useAuth();
  const theme = useTheme();
  const company = membership?.companyId ?? '';
  const employee = membership?.role === 'employee';
  const storeId = membership?.storeId ?? '';
  const [search, setSearch] = useState('');
  const [payment, setPayment] = useState('cash');
  const cache = useQueryClient();
  const { items, add, setQuantity, remove, clear } = useSaleCart();
  const scannedAdded = useRef(false);
  const stock = useQuery({
    queryKey: ['sale-stock', company, storeId],
    queryFn: () => getSaleStock(company, storeId),
    enabled: !!company && !!storeId,
  });

  useEffect(() => {
    if (scannedAdded.current || !productId || !stock.data) return;
    const found = stock.data.find((item) =>
      item.productId === productId && (!variantId || item.variantId === variantId));
    if (found?.available) {
      add(found);
      scannedAdded.current = true;
    }
  }, [productId, variantId, stock.data, add]);

  const shown = (stock.data ?? [])
    .filter((item) => `${item.name} ${item.sku}`.toLowerCase().includes(search.trim().toLowerCase()))
    .slice(0, 30);
  const totals = useMemo(() => ({
    total: items.reduce((sum, item) => sum + item.salePrice * item.quantity, 0),
    grossProfit: items.reduce(
      (sum, item) => sum + (item.salePrice - item.purchasePrice) * item.quantity,
      0,
    ),
  }), [items]);
  const save = useMutation({
    mutationFn: () => createSale(storeId, payment, items),
    onSuccess: async (result) => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['sales', company] }),
        cache.invalidateQueries({ queryKey: ['stock-levels', company] }),
        cache.invalidateQueries({ queryKey: ['sale-stock', company, storeId] }),
        cache.invalidateQueries({ queryKey: ['cash-transactions', company, storeId] }),
        cache.invalidateQueries({ queryKey: ['cash-summary', company, storeId] }),
      ]);
      clear();
      router.replace((employee ? `/employee/sales/${result.saleId}` : `/sales/${result.saleId}`) as never);
    },
  });

  return (
    <AdminPage
      title="Nouvelle vente"
      action={<IconButton accessibilityLabel="Scanner un produit" icon="barcode-scan" onPress={() => router.push({ pathname: (employee ? '/employee/scanner' : '/scanner') as never, params: { mode: 'sale' } })} />}
    >
      <Card mode="outlined" style={{ borderColor: theme.colors.primary }}>
        <Card.Content style={styles.notice}>
          <Chip icon="lock-outline">Catalogue en lecture seule</Chip>
          <Text style={{ color: theme.colors.onSurfaceVariant }}>
            La vente permet uniquement de choisir les articles et les quantités. Le produit, son prix et son stock se modifient depuis leurs modules d’origine.
          </Text>
        </Card.Content>
      </Card>
      <Searchbar placeholder="Rechercher un produit ou un SKU" value={search} onChangeText={setSearch} />
      {!!stock.error && <HelperText type="error" visible>{stock.error.message}</HelperText>}
      <View style={styles.list}>
        {shown.map((item) => {
          const available = item.available > 0;
          return (
            <Card key={cartKey(item)} mode="contained" style={[{ backgroundColor: theme.colors.surface }, !available && styles.unavailable]} onPress={available ? () => add(item) : undefined}>
              <Card.Title
                left={() => <ProductThumbnail url={item.imageUrl} />}
                title={item.name}
                subtitle={`${item.sku} • Prix catalogue ${formatMoney(item.salePrice)}`}
                right={() => available
                  ? <Chip style={styles.chip} icon="package-variant">Stock {item.available.toFixed(3)}</Chip>
                  : <Chip style={styles.chip} icon="alert-circle-outline">Stock épuisé</Chip>}
              />
              {!available && <Card.Content><Text style={{ color: theme.colors.error }}>Ajoutez le stock depuis la fiche Produit ou le module Stock.</Text></Card.Content>}
            </Card>
          );
        })}
        {!stock.isLoading && !shown.length && <Text>Aucun produit ne correspond à cette recherche.</Text>}
      </View>
      <Text variant="headlineSmall">Panier ({items.length})</Text>
      {items.map((item) => {
        const id = cartKey(item);
        return (
          <Card key={id} mode="contained" style={{ backgroundColor: theme.colors.surface }}>
            <Card.Title title={item.name} subtitle={`${formatMoney(item.salePrice)} • disponible ${item.available.toFixed(3)}`} right={() => <IconButton icon="delete" onPress={() => remove(id)} />} />
            <Card.Content style={styles.list}>
              <TextInput style={styles.field} mode="outlined" label="Quantité" keyboardType="decimal-pad" value={String(item.quantity)} onChangeText={(value) => setQuantity(id, Number(value) || 0)} />
              <Text>Total ligne : {formatMoney(item.salePrice * item.quantity)}{!employee ? ` • Bénéfice : ${formatMoney((item.salePrice - item.purchasePrice) * item.quantity)}` : ''}</Text>
            </Card.Content>
          </Card>
        );
      })}
      <Text variant="titleMedium">Paiement</Text>
      <SegmentedButtons value={payment} onValueChange={setPayment} buttons={[{ value: 'cash', label: 'Espèces' }, { value: 'card', label: 'Carte' }, { value: 'mobile_money', label: 'Mobile' }]} />
      <Card mode="contained" style={{ backgroundColor: theme.colors.primaryContainer }}>
        <Card.Content>
          <Text variant="headlineSmall">Total : {formatMoney(totals.total)}</Text>
          {!employee && <Text style={{ color: theme.colors.primary }}>Bénéfice brut : {formatMoney(totals.grossProfit)}</Text>}
        </Card.Content>
      </Card>
      {!!save.error && <HelperText type="error" visible>{save.error.message}</HelperText>}
      <AppButton icon="check" loading={save.isPending} disabled={!items.length || !storeId || save.isPending} onPress={() => save.mutate()}>
        Valider la vente
      </AppButton>
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  unavailable: { opacity: 0.72 },
  chip: { marginRight: 12 },
  field: { width: '100%', maxWidth: 320 },
  notice: { gap: 10 },
});
