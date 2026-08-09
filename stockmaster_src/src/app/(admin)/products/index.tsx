import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Card, FAB, HelperText, Searchbar, Text } from 'react-native-paper';

import { ProductThumbnail } from '@/components/products/ProductThumbnail';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/features/auth/AuthProvider';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import { getProducts, PRODUCT_PAGE_SIZE } from '@/features/products/api';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

export default function ProductsScreen() {
  const { formatMoney } = useCurrency();
  const { membership } = useAuth();
  const company = membership?.companyId ?? '';
  const store = membership?.storeId ?? '';
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search);
  const products = useInfiniteQuery({
    queryKey: ['products', company, store, debounced],
    queryFn: ({ pageParam }) => getProducts(company, store, debounced, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => lastPage.length === PRODUCT_PAGE_SIZE ? pages.length : undefined,
    enabled: !!company && !!store,
  });
  const rows = products.data?.pages.flat() ?? [];

  return (
    <AdminPage
      title="Produits"
      action={<FAB size="small" icon="plus" onPress={() => router.push('/products/new' as never)} />}
    >
      <Searchbar
        placeholder="Nom, SKU ou code-barres"
        value={search}
        onChangeText={setSearch}
        loading={search !== debounced}
      />
      {!!products.error && <HelperText type="error" visible>{products.error.message}</HelperText>}
      {rows.map((product) => (
        <Card key={product.id} onPress={() => router.push(`/products/${product.id}` as never)}>
          <Card.Title
            left={() => <ProductThumbnail url={product.image_urls?.[0]} />}
            title={product.name}
            subtitle={`${product.sku} • ${product.category?.name ?? 'Sans catégorie'}`}
            right={() => <Text style={{ marginRight: 16 }}>{formatMoney(Number(product.sale_price))}</Text>}
          />
        </Card>
      ))}
      {products.hasNextPage && (
        <AppButton
          mode="outlined"
          icon="chevron-down"
          loading={products.isFetchingNextPage}
          onPress={() => void products.fetchNextPage()}
        >
          Charger plus de produits
        </AppButton>
      )}
      {!products.isLoading && !rows.length && (
        <EmptyState
          icon="package-variant"
          title={search ? 'Aucun résultat' : 'Aucun produit'}
          message={search ? 'Essayez un autre nom, SKU ou code-barres.' : 'Créez votre premier produit pour constituer le catalogue.'}
        />
      )}
    </AdminPage>
  );
}
