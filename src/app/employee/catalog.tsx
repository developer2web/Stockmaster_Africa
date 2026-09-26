import { router } from 'expo-router';
import { distinctProductName, homonymIndex } from '@/utils/productLabel';
import { useQuery } from '@tanstack/react-query';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Card, Icon, Text, useTheme } from 'react-native-paper';
import { useState } from 'react';
import { AdminPage } from '@/components/ui/AdminPage';
import { ErrorState } from '@/components/ui/ErrorState';
import { PermissionGuard } from '@/features/auth/PermissionGuard';
import { useAuth } from '@/features/auth/AuthProvider';
import { getProducts, getSuppliers } from '@/features/products/api';
import { ProductThumbnail } from '@/components/products/ProductThumbnail';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import { hasPermission } from '@/features/auth/permissions';
import { AppSearchBar } from '@/components/ui/AppSearchBar';

export default function EmployeeCatalog() {
  const { formatMoney } = useCurrency();
  const { membership } = useAuth();
  const { width } = useWindowDimensions();
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const company = membership?.companyId ?? '';
  const store = membership?.storeId ?? '';
  const can = (permission: string) => hasPermission(membership, permission);
  const products = useQuery({ queryKey: ['employee-catalog-products', company, store, 'without-cost'], queryFn: () => getProducts(company, store), enabled: !!company && !!store && can('products.read') });
  const suppliers = useQuery({ queryKey: ['suppliers', company, store], queryFn: () => getSuppliers(company, store), enabled: !!company && !!store && can('suppliers.read') });
  const normalized = search.trim().toLowerCase();
  const visibleProducts = (products.data ?? []).filter((product) =>
    !normalized || product.name.toLowerCase().includes(normalized) || product.barcode?.toLowerCase().includes(normalized),
  );
  const error = products.error ?? suppliers.error;

  const homonyms = homonymIndex(products.data ?? []);
  return (
    <PermissionGuard permission={['products.read', 'suppliers.read']}>
      <AdminPage title="Catalogue">
        <View style={styles.stats}>
          {[
            // Retour testeur du 26/09 : « … » pendant le chargement, pas un 0 qui ressemble à un résultat.
            can('products.read') && ['Produits', products.data ? products.data.length : '…', 'package-variant-closed', '#084B50'],
            can('suppliers.read') && ['Fournisseurs', suppliers.data ? suppliers.data.filter(supplier => can('suppliers.write') || supplier.is_active).length : '…', 'truck-outline', '#E67700'],
          ].filter(Boolean).map((item) => {
            const [label, value, icon, color] = item as [string, number | string, string, string];
            return (
              <Card key={label} mode="contained" style={[styles.stat, { backgroundColor: theme.colors.surface }, width < 520 && styles.statFull]}>
                <Card.Content style={styles.statContent}>
                  <View style={[styles.statIcon, { backgroundColor: `${color}1F` }]}><Icon source={icon} size={24} color={color} /></View>
                  <View><Text variant="headlineSmall" style={styles.bold}>{value}</Text><Text style={{ color: theme.colors.onSurfaceVariant }}>{label}</Text></View>
                </Card.Content>
              </Card>
            );
          })}
        </View>
        {can('products.read') && (
          <AppSearchBar placeholder="Rechercher un nom ou code-barres" value={search} onChangeText={setSearch} />
        )}
        {error && <ErrorState message={error.message} onRetry={() => { void products.refetch(); void suppliers.refetch(); }} />}
        {can('products.read') && visibleProducts.length === 0 && !products.isLoading && (
          <Card mode="outlined"><Card.Content style={styles.empty}><Icon source="package-variant" size={34} color={theme.colors.onSurfaceVariant} /><Text>Aucun produit trouvé.</Text></Card.Content></Card>
        )}
        <View style={styles.productGrid}>
          {visibleProducts.map((product) => (
            <Card key={product.id} mode="contained" onPress={() => router.push(`/employee/products/${product.id}` as never)} style={[styles.product, { backgroundColor: theme.colors.surface }, width < 620 && styles.productFull]}>
              <Card.Content style={styles.productContent}>
                <ProductThumbnail url={product.image_urls?.[0]} size={44} />
                <View style={styles.productCopy}>
                  <Text variant="titleMedium" numberOfLines={2} style={styles.bold}>{distinctProductName(product, homonyms)}</Text>
                  {!!(product.barcode || product.sku) && <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Code : {product.barcode || product.sku}</Text>}
                </View>
                <Text variant="titleMedium" style={{ color: theme.colors.primary, fontWeight: '800' }}>{formatMoney(Number(product.sale_price))}</Text>
              </Card.Content>
            </Card>
          ))}
        </View>
      </AdminPage>
    </PermissionGuard>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  stat: { flexGrow: 1, flexBasis: '29%', borderRadius: 20 },
  statFull: { flexBasis: '100%' },
  statContent: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  bold: { fontWeight: '800' },
  productGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  product: { flexGrow: 1, flexBasis: '46%', borderRadius: 18 },
  productFull: { flexBasis: '100%' },
  productContent: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  productIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  productCopy: { flex: 1, minWidth: 0 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 20 },
});
