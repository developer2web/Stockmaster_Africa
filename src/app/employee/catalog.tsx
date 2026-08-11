import { useQuery } from '@tanstack/react-query';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Card, Icon, Searchbar, Text, useTheme } from 'react-native-paper';
import { useState } from 'react';
import { AdminPage } from '@/components/ui/AdminPage';
import { ErrorState } from '@/components/ui/ErrorState';
import { PermissionGuard } from '@/features/auth/PermissionGuard';
import { useAuth } from '@/features/auth/AuthProvider';
import { getCategories, getProducts, getSuppliers } from '@/features/products/api';
import { ProductThumbnail } from '@/components/products/ProductThumbnail';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import { hasPermission } from '@/features/auth/permissions';

export default function EmployeeCatalog() {
  const { formatMoney } = useCurrency();
  const { membership } = useAuth();
  const { width } = useWindowDimensions();
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const company = membership?.companyId ?? '';
  const store = membership?.storeId ?? '';
  const can = (permission: string) => hasPermission(membership, permission);
  const products = useQuery({ queryKey: ['products', company, store, 'employee'], queryFn: () => getProducts(company, store), enabled: !!company && !!store && can('products.read') });
  const categories = useQuery({ queryKey: ['categories', company, store], queryFn: () => getCategories(company, store), enabled: !!company && !!store && can('categories.read') });
  const suppliers = useQuery({ queryKey: ['suppliers', company, store], queryFn: () => getSuppliers(company, store), enabled: !!company && !!store && can('suppliers.read') });
  const normalized = search.trim().toLowerCase();
  const visibleProducts = (products.data ?? []).filter((product) =>
    !normalized || product.name.toLowerCase().includes(normalized) || product.sku.toLowerCase().includes(normalized) || product.barcode?.toLowerCase().includes(normalized),
  );
  const error = products.error ?? categories.error ?? suppliers.error;

  return (
    <PermissionGuard permission={['products.read', 'categories.read', 'suppliers.read']}>
      <AdminPage title="Catalogue">
        <View style={styles.stats}>
          {[
            can('products.read') && ['Produits', products.data?.length ?? 0, 'package-variant-closed', '#087F5B'],
            can('categories.read') && ['Catégories', categories.data?.length ?? 0, 'shape-outline', '#1971C2'],
            can('suppliers.read') && ['Fournisseurs', suppliers.data?.length ?? 0, 'truck-outline', '#E67700'],
          ].filter(Boolean).map((item) => {
            const [label, value, icon, color] = item as [string, number, string, string];
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
          <Searchbar placeholder="Rechercher un nom, SKU ou code-barres" value={search} onChangeText={setSearch} />
        )}
        {error && <ErrorState message={error.message} onRetry={() => { void products.refetch(); void categories.refetch(); void suppliers.refetch(); }} />}
        {can('products.read') && visibleProducts.length === 0 && !products.isLoading && (
          <Card mode="outlined"><Card.Content style={styles.empty}><Icon source="package-variant" size={34} color={theme.colors.onSurfaceVariant} /><Text>Aucun produit trouvé.</Text></Card.Content></Card>
        )}
        <View style={styles.productGrid}>
          {visibleProducts.map((product) => (
            <Card key={product.id} mode="contained" style={[styles.product, { backgroundColor: theme.colors.surface }, width < 620 && styles.productFull]}>
              <Card.Content style={styles.productContent}>
                <ProductThumbnail url={product.image_urls?.[0]} size={44} />
                <View style={styles.productCopy}>
                  <Text variant="titleMedium" numberOfLines={1} style={styles.bold}>{product.name}</Text>
                  <Text style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1}>{product.sku}{product.category?.name ? ` · ${product.category.name}` : ''}</Text>
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
