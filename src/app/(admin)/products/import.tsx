import { useMutation,useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Card,Chip,HelperText,Text } from 'react-native-paper';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { useAuth } from '@/features/auth/AuthProvider';
import { type ImportPreview,importProductRows,selectProductWorkbook,shareProductTemplate } from '@/features/products/excel';
import { FeatureGate } from '@/components/subscriptions/FeatureGate';

export default function ProductImport(){
  const{membership}=useAuth();const cache=useQueryClient();const[rows,setRows]=useState<ImportPreview[]>([]);const[actionError,setActionError]=useState('');
  const pick=async()=>{setActionError('');try{setRows(await selectProductWorkbook()??[])}catch(error){setActionError(error instanceof Error?error.message:'Fichier illisible')}};
  const template=async()=>{setActionError('');try{await shareProductTemplate()}catch(error){setActionError(error instanceof Error?error.message:'Modèle indisponible')}};
  const run=useMutation({mutationFn:()=>importProductRows(membership?.companyId??'',membership?.storeId??'',rows),onSuccess:async result=>{await Promise.all([cache.invalidateQueries({queryKey:['products']}),cache.invalidateQueries({queryKey:['stock-levels']}),cache.invalidateQueries({queryKey:['sale-stock']})]);if(!result.errors.length)router.replace('/products' as never)}});
  const valid=rows.filter(row=>row.valid).length;
  return <FeatureGate feature="excel_export" label="Import et export Excel"><AdminPage title="Importer des produits"><Card mode="contained"><Card.Title title="Fichier Excel StockMaster" subtitle="Vérification avant toute création"/><Card.Content><Text>Téléchargez le modèle, complétez-le sans modifier les colonnes, puis sélectionnez le fichier. Les lignes invalides ne seront pas importées.</Text></Card.Content><Card.Actions><AppButton mode="outlined" icon="download" onPress={()=>void template()}>Télécharger le modèle</AppButton><AppButton icon="file-excel" onPress={()=>void pick()}>Choisir le fichier</AppButton></Card.Actions></Card>{rows.length>0&&<Chip>{valid}/{rows.length} lignes valides</Chip>}{rows.map(row=><Card key={row.row} mode="outlined"><Card.Title title={`Ligne ${row.row} • ${row.name||'Sans nom'}`} subtitle={row.valid?row.sku:row.error} right={()=> <Chip style={{marginRight:12}} icon={row.valid?'check':'alert'}>{row.valid?'Valide':'Erreur'}</Chip>}/></Card>)}{!!actionError&&<HelperText type="error" visible>{actionError}</HelperText>}{!!run.error&&<HelperText type="error" visible>{run.error.message}</HelperText>}{run.data?.errors.map(error=><HelperText key={error} type="error" visible>{error}</HelperText>)}<AppButton icon="database-import" loading={run.isPending} disabled={!valid||run.isPending} onPress={()=>run.mutate()}>Importer {valid} produit(s)</AppButton></AdminPage></FeatureGate>
}
