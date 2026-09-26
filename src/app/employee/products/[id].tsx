import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Card, Chip, HelperText, Text, useTheme } from 'react-native-paper';
import { ProductFormScreen } from '@/features/products/ProductFormScreen';
import { PermissionGuard } from '@/features/auth/PermissionGuard';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProductThumbnail } from '@/components/products/ProductThumbnail';
import { useAuth } from '@/features/auth/AuthProvider';
import { usePermissions } from '@/features/auth/usePermissions';
import { getSaleStock } from '@/features/sales/api';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import { distinctProductName, homonymIndex, unitLabel } from '@/utils/productLabel';
import { formatQuantity } from '@/utils/number';

// Retour testeur du 26/09 : la recherche globale, le scanner et la liste Produits menaient
// un employé en simple consultation vers le formulaire de MODIFICATION (réservé à « Gérer
// les produits ») → « Accès non attribué ». Il a maintenant une fiche en lecture seule,
// construite sur les mêmes données que l'écran de vente (sans prix d'achat).
function ProductSheet({ id }: { id: string }) {
  const theme = useTheme();
  const can = usePermissions();
  const { membership } = useAuth();
  const { formatMoney } = useCurrency();
  const company = membership?.companyId ?? '';
  const store = membership?.storeId ?? '';
  const stock = useQuery({ queryKey: ['sale-stock', company, store, 'without-cost'], queryFn: () => getSaleStock(company, store, false), enabled: !!company && !!store });
  const lines = (stock.data ?? []).filter(item => item.productId === id);
  const base = lines.find(item => !item.variantId) ?? lines[0];
  const homonyms = homonymIndex(stock.data ?? []);

  return <AdminPage title={base ? distinctProductName(base, homonyms) : 'Produit'} backTo="/employee/products">
    {!!stock.error && <HelperText type="error" visible>{stock.error.message}</HelperText>}
    {stock.isLoading && <Text>Chargement du produit…</Text>}
    {!stock.isLoading && !stock.error && !base && <EmptyState icon="package-variant-remove" title="Produit indisponible" message="Ce produit n’existe pas dans cette boutique, ou il est archivé." />}
    {base && <Card mode="contained" style={{ backgroundColor: theme.colors.surface }}>
      <Card.Content style={styles.header}>
        <ProductThumbnail url={base.imageUrl} size={72} />
        <View style={styles.copy}>
          <Text variant="titleLarge" style={styles.bold}>{distinctProductName(base, homonyms)}</Text>
          <Text variant="headlineSmall" style={[styles.bold, { color: theme.colors.primary }]}>{formatMoney(base.salePrice)}</Text>
          <Text>par {unitLabel(base.unit).toLocaleLowerCase('fr')}</Text>
        </View>
      </Card.Content>
      <Card.Content style={styles.details}>
        <View style={styles.chips}>
          <Chip icon="package-variant">{unitLabel(base.unit)}</Chip>
          {!!base.sku && <Chip icon="identifier">Réf. {base.sku}</Chip>}
          <Chip icon={base.available > 0 ? 'check-circle-outline' : 'alert-circle-outline'}>{base.available > 0 ? `En stock : ${formatQuantity(base.available)}` : 'Rupture de stock'}</Chip>
        </View>
        {base.lookupCodes.filter(code => code && code !== base.sku).length > 0 && <Text style={{ color: theme.colors.onSurfaceVariant }}>Codes : {base.lookupCodes.filter(code => code && code !== base.sku).join(' · ')}</Text>}
        {!!base.bulkUnitLabel && !!base.bulkQuantity && !!base.bulkPrice && <Text>Vente en gros : {base.bulkUnitLabel} de {formatQuantity(base.bulkQuantity)} à {formatMoney(base.bulkPrice)}</Text>}
        {lines.filter(line => line.variantId).map(line => <Text key={line.stockLevelId}>• {line.name} — {formatMoney(line.salePrice)} · stock {formatQuantity(line.available)}</Text>)}
      </Card.Content>
      {can('sales.write') && base.available > 0 && <Card.Actions>
        <AppButton icon="cart-plus" onPress={() => router.push({ pathname: '/employee/sales/new' as never, params: { productId: id } })}>Vendre ce produit</AppButton>
      </Card.Actions>}
    </Card>}
  </AdminPage>;
}

export default function EmployeeProductDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const can = usePermissions();
  if (can('products.write')) return <PermissionGuard permission="products.write"><ProductFormScreen id={id} basePath="/employee/products" /></PermissionGuard>;
  return <PermissionGuard permission="products.read"><ProductSheet id={id} /></PermissionGuard>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  bold: { fontWeight: '800' },
  details: { gap: 10, marginTop: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
