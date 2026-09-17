import { useInfiniteQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Chip, HelperText, Menu, Text, useTheme } from 'react-native-paper';

import { ProductThumbnail } from '@/components/products/ProductThumbnail';
import { AdminPage } from '@/components/ui/AdminPage';
import { resolveNotice } from '@/constants/notices';
import { AppButton } from '@/components/ui/AppButton';
import { plural } from '@/utils/plural';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppSearchBar } from '@/components/ui/AppSearchBar';
import { AppFeedback } from '@/components/ui/AppFeedback';
import { StatusChip } from '@/components/ui/StatusChip';
import { useAuth } from '@/features/auth/AuthProvider';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import { getProducts, PRODUCT_PAGE_SIZE } from '@/features/products/api';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { shareProductCatalog } from '@/features/products/catalog';
import { useProductListView } from '@/stores/productListView';
import { readableError } from '@/utils/errors';
import { nextPageCursor, type PageCursor } from '@/utils/pagination';

export default function ProductsScreen() {
  const {notice}=useLocalSearchParams<{notice?:string}>();
  const { formatMoney } = useCurrency();
  const { membership } = useAuth();
  const theme = useTheme();
  const company = membership?.companyId ?? '';
  const store = membership?.storeId ?? '';
  const listScope=`${company}:${store}:admin`;
  const search=useProductListView(state=>state.searches[listScope]??'');
  const setSearchValue=useProductListView(state=>state.setSearch);
  const [actionsOpen,setActionsOpen]=useState(false);
  const [actionError,setActionError]=useState('');
  const [feedback,setFeedback]=useState(resolveNotice(notice));
  const debounced = useDebouncedValue(search);
  const products = useInfiniteQuery({
    queryKey: ['products', company, store, debounced, 'without-cost'],
    queryFn: ({ pageParam }) => getProducts(company, store, debounced, pageParam),
    initialPageParam: null as PageCursor,
    getNextPageParam: (lastPage) => nextPageCursor(lastPage, PRODUCT_PAGE_SIZE),
    enabled: !!company && !!store,
  });
  const rows = products.data?.pages.flat() ?? [];
  const runAction=async(action:()=>Promise<void>)=>{setActionsOpen(false);setActionError('');try{await action()}catch(error){setActionError(readableError(error,'Action impossible. Réessayez.'))}};

  return (
    <AdminPage
      title="Produits"
      action={<View style={styles.actions}><Menu visible={actionsOpen} onDismiss={()=>setActionsOpen(false)} anchor={<AppButton mode="outlined" icon="dots-horizontal" accessibilityLabel="Actions produits" onPress={()=>setActionsOpen(true)}>Actions</AppButton>}><Menu.Item leadingIcon="whatsapp" title="Partager le catalogue" onPress={()=>void runAction(()=>shareProductCatalog(membership?.companyName??'StockMaster',rows,formatMoney))}/><Menu.Item leadingIcon="file-excel" title="Importer Excel" onPress={()=>{setActionsOpen(false);router.push('/products/import' as never)}}/></Menu><AppButton icon="plus" onPress={() => router.push('/products/new' as never)}>Ajouter</AppButton></View>}
    >
      <AppSearchBar
        placeholder="Nom ou code-barres"
        value={search}
        onChangeText={value=>setSearchValue(listScope,value)}
        loading={search !== debounced}
      />
      {!!products.error && <HelperText type="error" visible>{readableError(products.error)}</HelperText>}
      <View style={styles.filters}>
        <Chip icon="package-variant">{rows.length} produit{plural(rows.length)}</Chip>
        <Chip icon="store-outline">{membership?.storeName ?? 'Boutique active'}</Chip>
      </View>
      <View style={styles.grid}>
        {rows.map((product) => (
          <Card mode="contained" style={[styles.gridCard, { backgroundColor: theme.colors.surface }]} key={product.id} onPress={() => router.push(`/products/${product.id}` as never)}>
            <View style={styles.gridImageWrap}>
              <ProductThumbnail url={product.image_urls?.[0]} size={78} />
              {!product.is_active && <StatusChip status="inactive" style={styles.gridStatus}/>}
            </View>
            <Card.Content style={styles.gridCopy}>
              <Text variant="titleSmall" numberOfLines={2} style={styles.gridName}>{product.name}</Text>
              <Text variant="titleMedium" style={styles.bold}>{formatMoney(Number(product.sale_price))}</Text>
            </Card.Content>
          </Card>
        ))}
      </View>
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
      <AppFeedback message={feedback} onDismiss={()=>setFeedback('')}/>
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  price: { alignItems: 'flex-end', gap: 4, marginRight: 14 },
  bold: { fontWeight: '800' },
  actions:{flexDirection:'row',flexWrap:'wrap',gap:8},
  // Grille à 3 colonnes façon Amazon, plutôt que la liste précédente : image
  // beaucoup plus grande (112 au lieu de 52), nom et prix en dessous.
  // flexBasis en pourcentage (plutôt qu'un nombre de pixels fixe) pour que 3
  // cartes tiennent par ligne quelle que soit la largeur de l'écran.
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  // flexBasis en pixels fixes (pas en %) pour que le nombre de colonnes
  // s'adapte tout seul à la largeur réelle : ~4 sur téléphone, davantage
  // sur un écran plus large (tablette, ordinateur), sans logique à part.
  gridCard: { flexBasis: 84, flexGrow: 1, minWidth: 80, maxWidth: 170, overflow: 'hidden' },
  gridImageWrap: { alignItems: 'center', paddingTop: 12, position: 'relative' },
  gridStatus: { position: 'absolute', top: 4, left: 4 },
  gridCopy: { alignItems: 'center', gap: 2, paddingTop: 8 },
  gridName: { textAlign: 'center' },
});
