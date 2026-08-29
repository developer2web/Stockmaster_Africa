import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import { router,useLocalSearchParams } from 'expo-router';
import { useEffect,useMemo,useState } from 'react';
import { Card,Chip,HelperText,TextInput } from 'react-native-paper';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { useAuth } from '@/features/auth/AuthProvider';
import { finalizeInventory,getInventory,startInventory } from '@/features/inventory/api';
import { formatQuantity,parseDecimal } from '@/utils/number';
import { FeatureGate } from '@/components/subscriptions/FeatureGate';
import { AppSearchBar } from '@/components/ui/AppSearchBar';

export default function InventoryCountScreen(){
  const{inventoryId,productId}=useLocalSearchParams<{inventoryId?:string;productId?:string}>();
  const{membership}=useAuth();const cache=useQueryClient();const storeId=membership?.storeId??'';
  const[id,setId]=useState(inventoryId??'');const[search,setSearch]=useState('');const[counts,setCounts]=useState<Record<string,string>>({});
  const start=useMutation({mutationFn:()=>startInventory(storeId),onSuccess:setId});
  const startInventoryNow=start.mutate;
  useEffect(()=>{if(!id&&storeId&&!start.isPending&&!start.isError)startInventoryNow()},[id,storeId,start.isPending,start.isError,startInventoryNow]);
  const inventory=useQuery({queryKey:['inventory-count',id],queryFn:()=>getInventory(id),enabled:!!id});
  useEffect(()=>{if(!inventory.data)return;setCounts(current=>{const next={...current};for(const item of inventory.data.inventory_items)if(next[item.id]===undefined)next[item.id]=item.counted_quantity===null?'':String(item.counted_quantity);return next})},[inventory.data]);
  const rows=useMemo(()=>{const needle=search.trim().toLowerCase();return(inventory.data?.inventory_items??[]).filter(item=>(!needle||`${item.product?.name} ${item.variant?.name??''}`.toLowerCase().includes(needle))&&(!productId||item.product_id===productId))},[inventory.data,productId,search]);
  const all=inventory.data?.inventory_items??[];const valid=all.length>0&&all.every(item=>counts[item.id]!==undefined&&counts[item.id]!==''&&parseDecimal(counts[item.id])>=0);
  const finish=useMutation({mutationFn:()=>finalizeInventory(id,all.map(item=>({itemId:item.id,countedQuantity:parseDecimal(counts[item.id])}))),onSuccess:async()=>{await Promise.all([cache.invalidateQueries({queryKey:['stock-levels']}),cache.invalidateQueries({queryKey:['stock-movements']}),cache.invalidateQueries({queryKey:['sale-stock']})]);router.replace('/stock' as never)}});
  return <FeatureGate feature="inventory_count" label="Inventaires physiques"><AdminPage title="Comptage physique" action={<AppButton mode="outlined" icon="barcode-scan" disabled={!id} onPress={()=>router.push({pathname:'/scanner' as never,params:{mode:'inventory',inventoryId:id}})}>Scanner</AppButton>}>
    <Card mode="contained"><Card.Title title={inventory.data?.status==='completed'?'Inventaire validé':start.isPending?'Préparation de l’inventaire…':'Inventaire en cours'} subtitle={`${all.filter(item=>counts[item.id]!==''&&counts[item.id]!==undefined).length}/${all.length} articles comptés`} left={()=> <Chip>{inventory.data?.status==='completed'?'Terminé':'Brouillon'}</Chip>}/></Card>
    {!!start.error&&<><HelperText type="error" visible>{start.error.message}</HelperText><AppButton mode="outlined" icon="reload" onPress={()=>start.reset()}>Réessayer</AppButton></>}
    <AppSearchBar placeholder="Nom du produit" value={search} onChangeText={setSearch}/>
    {rows.map(item=>{const counted=parseDecimal(counts[item.id]??'');const difference=Number.isFinite(counted)?counted-Number(item.expected_quantity):null;return <Card key={item.id} mode="outlined"><Card.Title title={item.variant?`${item.product?.name} • ${item.variant.name}`:item.product?.name??'Produit'} subtitle={`Stock théorique : ${formatQuantity(Number(item.expected_quantity))}`} right={()=>difference===null?null:<Chip style={{marginRight:12}}>{difference>0?'+':''}{formatQuantity(difference)}</Chip>}/><Card.Content><TextInput mode="outlined" label="Quantité réellement comptée" value={counts[item.id]??''} onChangeText={value=>setCounts(current=>({...current,[item.id]:value}))} keyboardType="decimal-pad"/></Card.Content></Card>})}
    {!!inventory.error&&<HelperText type="error" visible>{inventory.error.message}</HelperText>}{!!finish.error&&<HelperText type="error" visible>{finish.error.message}</HelperText>}
    <AppButton icon="check-decagram" loading={finish.isPending} disabled={!valid||finish.isPending||inventory.data?.status==='completed'} onPress={()=>finish.mutate()}>Valider et corriger le stock</AppButton>
  </AdminPage></FeatureGate>
}
