import { useInfiniteQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Card, FAB, HelperText, Text } from 'react-native-paper';
import { AdminPage } from '@/components/ui/AdminPage';
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

export default function EmployeeProducts() {
  const {notice}=useLocalSearchParams<{notice?:string}>();
  const { formatMoney } = useCurrency();
  const { membership } = useAuth();
  const company = membership?.companyId ?? '';
  const store = membership?.storeId ?? '';
  const canWrite = !!membership?.permissions.includes('products.write');
  const [feedback,setFeedback]=useState(notice??'');
  const listScope=`${company}:${store}:employee`;
  const search=useProductListView(state=>state.searches[listScope]??'');
  const setSearch=useProductListView(state=>state.setSearch);
  const debounced = useDebouncedValue(search);
  const query = useInfiniteQuery({ queryKey: ['employee-products', company, store, debounced], queryFn: ({pageParam}) => getProducts(company, store, debounced,pageParam),initialPageParam:0,getNextPageParam:(last,pages)=>last.length===PRODUCT_PAGE_SIZE?pages.length:undefined, enabled: !!company && !!store });
  const products=query.data?.pages.flat()??[];
  return <PermissionGuard permission="products.read"><AdminPage title="Produits" action={canWrite ? <FAB size="small" icon="plus" onPress={() => router.push('/employee/products/new' as never)} /> : undefined}>
    <AppSearchBar placeholder="Nom ou code-barres" value={search} onChangeText={value=>setSearch(listScope,value)} loading={search !== debounced} />
    {!!query.error&&<HelperText type="error" visible>{readableError(query.error)}</HelperText>}
    {products.map((product) => <Card key={product.id} mode="contained" onPress={canWrite ? () => router.push(`/employee/products/${product.id}` as never) : undefined}><Card.Title left={()=><ProductThumbnail url={product.image_urls?.[0]}/>} title={product.name} subtitle={product.category?.name ?? 'Sans catégorie'} right={() => <Text style={{ marginRight: 16 }}>{formatMoney(Number(product.sale_price))}</Text>} /></Card>)}
    {query.hasNextPage&&<AppButton mode="outlined" loading={query.isFetchingNextPage} onPress={()=>void query.fetchNextPage()}>Charger plus de produits</AppButton>}
    {!query.isLoading && !products.length && <EmptyState icon="package-variant" title={search ? 'Aucun résultat' : 'Aucun produit'} message={search ? 'Modifiez votre recherche.' : 'Aucun produit dans le catalogue.'} />}
    <AppFeedback message={feedback} onDismiss={()=>setFeedback('')}/>
  </AdminPage></PermissionGuard>;
}
