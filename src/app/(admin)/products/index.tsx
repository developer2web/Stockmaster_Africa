import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Chip, HelperText, Menu, Text, useTheme } from 'react-native-paper';

import { ProductThumbnail } from '@/components/products/ProductThumbnail';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppSearchBar } from '@/components/ui/AppSearchBar';
import { AppFeedback } from '@/components/ui/AppFeedback';
import { StatusChip } from '@/components/ui/StatusChip';
import { useAuth } from '@/features/auth/AuthProvider';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import { getProducts, PRODUCT_PAGE_SIZE } from '@/features/products/api';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { shareProductsExport } from '@/features/products/excel';
import { shareProductCatalog } from '@/features/products/catalog';

export default function ProductsScreen() {
  const { formatMoney } = useCurrency();
  const { membership } = useAuth();
  const theme = useTheme();
  const company = membership?.companyId ?? '';
  const store = membership?.storeId ?? '';
  const [search, setSearch] = useState('');
  const [actionsOpen,setActionsOpen]=useState(false);
  const [actionError,setActionError]=useState('');
  const debounced = useDebouncedValue(search);
  const products = useInfiniteQuery({
    queryKey: ['products', company, store, debounced],
    queryFn: ({ pageParam }) => getProducts(company, store, debounced, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => lastPage.length === PRODUCT_PAGE_SIZE ? pages.length : undefined,
    enabled: !!company && !!store,
  });
  const rows = products.data?.pages.flat() ?? [];
  const runAction=async(action:()=>Promise<void>)=>{setActionsOpen(false);setActionError('');try{await action()}catch(error){setActionError(error instanceof Error?error.message:'Action impossible')}};

  return (
    <AdminPage
      title="Produits"
      action={<View style={styles.actions}><Menu visible={actionsOpen} onDismiss={()=>setActionsOpen(false)} anchor={<AppButton mode="outlined" icon="dots-horizontal" accessibilityLabel="Actions produits" onPress={()=>setActionsOpen(true)}>Actions</AppButton>}><Menu.Item leadingIcon="shape-outline" title="Gérer les catégories" onPress={()=>{setActionsOpen(false);router.push('/categories' as never)}}/><Menu.Item leadingIcon="whatsapp" title="Partager le catalogue" onPress={()=>void runAction(()=>shareProductCatalog(membership?.companyName??'StockMaster',rows,formatMoney))}/><Menu.Item leadingIcon="download" title="Exporter Excel" onPress={()=>void runAction(()=>shareProductsExport(company,store))}/><Menu.Item leadingIcon="file-excel" title="Importer Excel" onPress={()=>{setActionsOpen(false);router.push('/products/import' as never)}}/></Menu><AppButton icon="plus" onPress={() => router.push('/products/new' as never)}>Ajouter</AppButton></View>}
    >
      <AppSearchBar
        placeholder="Nom ou code-barres"
        value={search}
        onChangeText={setSearch}
        loading={search !== debounced}
      />
      {!!products.error && <HelperText type="error" visible>{products.error.message}</HelperText>}
      <View style={styles.filters}>
        <Chip icon="package-variant">{rows.length} produit(s)</Chip>
        <Chip icon="store-outline">{membership?.storeName ?? 'Boutique active'}</Chip>
      </View>
      {rows.map((product) => (
        <Card mode="contained" style={{ backgroundColor: theme.colors.surface }} key={product.id} onPress={() => router.push(`/products/${product.id}` as never)}>
          <Card.Title
            left={() => <ProductThumbnail url={product.image_urls?.[0]} />}
            title={product.name}
            subtitle={product.category?.name ?? 'Sans catégorie'}
            right={() => <View style={styles.price}><Text variant="titleMedium" style={styles.bold}>{formatMoney(Number(product.sale_price))}</Text><StatusChip status={product.is_active?'active':'inactive'}/></View>}
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
          message={search ? 'Essayez un autre nom ou code-barres.' : 'Créez votre premier produit pour constituer le catalogue.'}
          action={!search?<AppButton icon="plus" onPress={()=>router.push('/products/new' as never)}>Ajouter un produit</AppButton>:undefined}
        />
      )}
      <AppFeedback message={actionError} type="error" onDismiss={()=>setActionError('')}/>
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  price: { alignItems: 'flex-end', gap: 4, marginRight: 14 },
  bold: { fontWeight: '800' },
  actions:{flexDirection:'row',flexWrap:'wrap',gap:8},
});
