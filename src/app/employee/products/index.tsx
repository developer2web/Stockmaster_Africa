import { usePermissions } from '@/features/auth/usePermissions';
import { useInfiniteQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, FAB, HelperText, Text } from 'react-native-paper';
import { AdminPage } from '@/components/ui/AdminPage';
import { resolveNotice } from '@/constants/notices';
import { EmptyState } from '@/components/ui/EmptyState';
import { PermissionGuard } from '@/features/auth/PermissionGuard';
import { useAuth } from '@/features/auth/AuthProvider';
import { getProducts, PRODUCT_PAGE_SIZE } from '@/features/products/api';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { ProductThumbnail } from '@/components/products/ProductThumbnail';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import { AppSearchBar } from '@/components/ui/AppSearchBar';
import { AppButton } from '@/components/ui/AppButton';
import { AppFeedback } from '@/components/ui/AppFeedback';
import { useProductListView } from '@/stores/productListView';
import { readableError } from '@/utils/errors';
import { nextPageCursor, type PageCursor } from '@/utils/pagination';

export default function EmployeeProducts() {
  const can = usePermissions();
  const {notice}=useLocalSearchParams<{notice?:string}>();
  const { formatMoney } = useCurrency();
  const { membership } = useAuth();
  const company = membership?.companyId ?? '';
  const store = membership?.storeId ?? '';
  const canWrite = can('products.write');
  const [feedback,setFeedback]=useState(resolveNotice(notice));
  const listScope=`${company}:${store}:employee`;
  const search=useProductListView(state=>state.searches[listScope]??'');
  const setSearch=useProductListView(state=>state.setSearch);
  const debounced = useDebouncedValue(search);
  const query = useInfiniteQuery({ queryKey: ['employee-products', company, store, debounced, 'without-cost'], queryFn: ({pageParam}) => getProducts(company, store, debounced,pageParam),initialPageParam:null as PageCursor,getNextPageParam:(last)=>nextPageCursor(last,PRODUCT_PAGE_SIZE), enabled: !!company && !!store });
  const products=query.data?.pages.flat()??[];
  return <PermissionGuard permission="products.read"><AdminPage title="Produits" action={canWrite ? <FAB size="small" icon="plus" onPress={() => router.push('/employee/products/new' as never)} /> : undefined}>
    <AppSearchBar placeholder="Nom ou code-barres" value={search} onChangeText={value=>setSearch(listScope,value)} loading={search !== debounced} />
    {!!query.error&&<HelperText type="error" visible>{readableError(query.error)}</HelperText>}
    <View style={styles.grid}>
      {products.map((product) => <Card key={product.id} mode="contained" style={styles.gridCard} onPress={canWrite ? () => router.push(`/employee/products/${product.id}` as never) : undefined}>
        <View style={styles.gridImageWrap}><ProductThumbnail url={product.image_urls?.[0]} size={54}/></View>
        <Card.Content style={styles.gridCopy}>
          <Text variant="titleSmall" numberOfLines={2} style={styles.gridName}>{product.name}</Text>
          {/* Retour testeur du 25/09 : le prix débordait quand trop de cartes tenaient par
              rangée — 3 par ligne sur téléphone (comme la grille de Nouvelle vente).
              adjustsFontSizeToFit n'a aucun effet sur le web (non supporté par
              react-native-web, vérifié en direct) : texte petit par défaut à la place,
              numberOfLines en filet de sécurité pour un montant vraiment extrême. */}
          <Text numberOfLines={1} style={styles.price}>{formatMoney(Number(product.sale_price))}</Text>
        </Card.Content>
      </Card>)}
    </View>
    {query.hasNextPage&&<AppButton mode="outlined" loading={query.isFetchingNextPage} onPress={()=>void query.fetchNextPage()}>Charger plus de produits</AppButton>}
    {!query.isLoading && !products.length && <EmptyState icon="package-variant" title={search ? 'Aucun résultat' : 'Aucun produit'} message={search ? 'Modifiez votre recherche.' : 'Aucun produit dans le catalogue.'} />}
    <AppFeedback message={feedback} onDismiss={()=>setFeedback('')}/>
  </AdminPage></PermissionGuard>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // flexBasis en pixels fixes (pas en %) pour que le nombre de colonnes
  // s'adapte tout seul à la largeur réelle : 3 sur téléphone (comme la
  // grille de Nouvelle vente), davantage sur un écran plus large. Cases
  // plus compactes et carrées (retour testeur du 25/09), pas de grandes
  // cartes rectangulaires.
  gridCard: { flexBasis: 106, flexGrow: 1, minWidth: 100, maxWidth: 150, overflow: 'hidden' },
  gridImageWrap: { alignItems: 'center', paddingTop: 8 },
  gridCopy: { alignItems: 'center', gap: 2, paddingTop: 4, paddingBottom: 8 },
  gridName: { textAlign: 'center' },
  price: { fontSize: 12, fontWeight: '800' },
  bold: { fontWeight: '800' },
});
