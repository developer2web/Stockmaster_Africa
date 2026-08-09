import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Card, FAB, Searchbar, Text } from 'react-native-paper';
import { AdminPage } from '@/components/ui/AdminPage';
import { EmptyState } from '@/components/ui/EmptyState';
import { PermissionGuard } from '@/features/auth/PermissionGuard';
import { useAuth } from '@/features/auth/AuthProvider';
import { getProducts } from '@/features/products/api';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { ProductThumbnail } from '@/components/products/ProductThumbnail';
import { useCurrency } from '@/features/currency/CurrencyProvider';

export default function EmployeeProducts() {
  const { formatMoney } = useCurrency();
  const { membership } = useAuth();
  const company = membership?.companyId ?? '';
  const store = membership?.storeId ?? '';
  const canWrite = !!membership?.permissions.includes('products.write');
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search);
  const query = useQuery({ queryKey: ['products', company, store, debounced], queryFn: () => getProducts(company, store, debounced), enabled: !!company && !!store });
  return <PermissionGuard permission="products.read"><AdminPage title="Produits" action={canWrite ? <FAB size="small" icon="plus" onPress={() => router.push('/employee/products/new' as never)} /> : undefined}>
    <Searchbar placeholder="Nom, SKU ou code-barres" value={search} onChangeText={setSearch} loading={search !== debounced} />
    {(query.data ?? []).map((product) => <Card key={product.id} mode="contained" onPress={canWrite ? () => router.push(`/employee/products/${product.id}` as never) : undefined}><Card.Title left={()=><ProductThumbnail url={product.image_urls?.[0]}/>} title={product.name} subtitle={`${product.sku} • ${product.category?.name ?? 'Sans catégorie'}`} right={() => <Text style={{ marginRight: 16 }}>{formatMoney(Number(product.sale_price))}</Text>} /></Card>)}
    {!query.isLoading && !query.data?.length && <EmptyState icon="package-variant" title={search ? 'Aucun résultat' : 'Aucun produit'} message={search ? 'Modifiez votre recherche.' : 'Aucun produit dans le catalogue.'} />}
  </AdminPage></PermissionGuard>;
}
