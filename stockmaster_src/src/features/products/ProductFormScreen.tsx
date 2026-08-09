import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ScrollView } from 'react-native';
import { Card, Dialog, FAB, HelperText, Portal, Switch, Text } from 'react-native-paper';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ProductImagesCard } from '@/components/products/ProductImagesCard';
import { StockAdjustmentDialog } from '@/components/products/StockAdjustmentDialog';
import { FormField } from '@/components/forms/FormField';
import { SelectField } from '@/components/forms/SelectField';
import { useAuth } from '@/features/auth/AuthProvider';
import { hasPermission } from '@/features/auth/permissions';
import { getStockLevels } from '@/features/inventory/api';
import { useStockRealtime } from '@/hooks/useStockRealtime';
import { deleteProduct, deleteVariant, getCategories, getProduct, getSuppliers, saveProduct, saveVariant } from './api';
import { productSchema, ProductInput, variantSchema, VariantInput } from '@/schemas/catalog';
import type { ProductVariant } from '@/types/database';
import { useCurrency } from '@/features/currency/CurrencyProvider';

const defaults: ProductInput = { name:'', description:'', sku:'', barcode:'', categoryId:null, supplierId:null, purchasePrice:'0', salePrice:'0', lowStockThreshold:'5', isActive:true };

export function ProductFormScreen({ id,initialBarcode,basePath='/products' }: { id?: string;initialBarcode?:string;basePath?:string }) {
  const { formatMoney } = useCurrency();
  const { membership } = useAuth();
  const company = membership?.companyId ?? '';
  const store = membership?.storeId ?? '';
  const qc = useQueryClient();
  useStockRealtime(company);
  const product = useQuery({ queryKey:['product',id], queryFn:()=>getProduct(id!), enabled:!!id });
  const categories = useQuery({ queryKey:['categories',company,store], queryFn:()=>getCategories(company,store), enabled:!!company&&!!store });
  const suppliers = useQuery({ queryKey:['suppliers',company,store], queryFn:()=>getSuppliers(company,store), enabled:!!company&&!!store });
  const { control, handleSubmit, reset } = useForm<ProductInput>({ resolver:zodResolver(productSchema), defaultValues:{...defaults,barcode:initialBarcode??''} });
  const levels = useQuery({queryKey:['stock-levels',company,store,id],queryFn:()=>getStockLevels(company,id,store),enabled:!!company&&!!store&&!!id});

  useEffect(() => { if (product.data) reset({ name:product.data.name, description:product.data.description??'', sku:product.data.sku, barcode:product.data.barcode??'', categoryId:product.data.category_id, supplierId:product.data.supplier_id, purchasePrice:String(product.data.purchase_price), salePrice:String(product.data.sale_price), lowStockThreshold:String(product.data.low_stock_threshold), isActive:product.data.is_active }); }, [product.data,reset]);

  const save = useMutation({ mutationFn:(v:ProductInput)=>saveProduct(company,store,v,id), onSuccess:async(saved)=>{ await qc.invalidateQueries({queryKey:['products',company,store]}); await qc.invalidateQueries({queryKey:['product',saved]}); if(!id) router.replace(`${basePath}/${saved}` as never); } });
  const [confirm,setConfirm] = useState(false);
  const [adjust,setAdjust] = useState<'in'|'out'|null>(null);
  const remove = useMutation({ mutationFn:()=>deleteProduct(id!), onSuccess:async()=>{ await qc.invalidateQueries({queryKey:['products',company]}); router.replace(basePath as never); } });
  const stockQuantity=(levels.data??[]).reduce((sum,row)=>sum+Number(row.quantity),0);
  const margin=product.data?Number(product.data.sale_price)-Number(product.data.purchase_price):0;
  const stockValue=product.data?stockQuantity*Number(product.data.purchase_price):0;
  const canAdjustStock=hasPermission(membership,'stock_movements.write');

  return <AdminPage title={id?'Fiche produit':'Nouveau produit'}>
    <FormField control={control} name="name" label="Nom du produit"/><FormField control={control} name="description" label="Description" multiline/><FormField control={control} name="sku" label="SKU" autoCapitalize="characters"/><FormField control={control} name="barcode" label="Code-barres facultatif" keyboardType="numeric"/>
    <Controller control={control} name="categoryId" render={({field,fieldState})=><SelectField label="Catégorie" value={field.value} options={[{label:'Sans catégorie',value:null},...(categories.data??[]).filter(v=>v.is_active).map(v=>({label:v.name,value:v.id}))]} onChange={field.onChange} error={fieldState.error?.message}/>}/>
    <Controller control={control} name="supplierId" render={({field,fieldState})=><SelectField label="Fournisseur" value={field.value} options={[{label:'Sans fournisseur',value:null},...(suppliers.data??[]).filter(v=>v.is_active).map(v=>({label:v.name,value:v.id}))]} onChange={field.onChange} error={fieldState.error?.message}/>}/>
    <FormField control={control} name="purchasePrice" label="Prix d’achat" keyboardType="decimal-pad"/><FormField control={control} name="salePrice" label="Prix de vente" keyboardType="decimal-pad"/><FormField control={control} name="lowStockThreshold" label="Seuil de stock faible" keyboardType="decimal-pad"/>
    <Controller control={control} name="isActive" render={({field})=><Card mode="outlined"><Card.Title title="Produit actif" right={()=><Switch value={field.value} onValueChange={field.onChange} style={{marginRight:12}}/>}/></Card>}/>
    {!!save.error&&<HelperText type="error" visible>{save.error.message}</HelperText>}<AppButton loading={save.isPending} onPress={handleSubmit(v=>save.mutate(v))}>Enregistrer</AppButton>
    {id&&<Card mode="contained" style={{backgroundColor:stockQuantity>0?'#E7F8F1':'#FFF3E0'}}><Card.Title title="Stock de la boutique active" subtitle={membership?.storeName??'Boutique'} left={props=><FAB {...props} size="small" icon="package-variant-closed"/>}/><Card.Content style={{gap:8}}><Text variant="displaySmall" style={{fontWeight:'900',color:stockQuantity>0?'#087F5B':'#C25B00'}}>{stockQuantity.toFixed(3)}</Text><Text>Valeur au prix d’achat : {formatMoney(stockValue)}</Text>{!canAdjustStock&&<Text>Vous pouvez consulter ce stock, mais votre rôle ne permet pas de le modifier.</Text>}</Card.Content>{canAdjustStock&&<Card.Actions><AppButton mode="contained" icon="plus" onPress={()=>setAdjust('in')}>Ajouter du stock</AppButton><AppButton mode="outlined" icon="minus" disabled={stockQuantity<=0} onPress={()=>setAdjust('out')}>Retirer</AppButton></Card.Actions>}</Card>}
    {id&&product.data&&<ProductImagesCard productId={id} companyId={company} storeId={store} urls={product.data.image_urls??[]}/>}
    {id&&product.data&&<Card mode="outlined"><Card.Title title="Indicateurs du produit"/><Card.Content style={{gap:6}}><Text>Marge unitaire : {formatMoney(margin)}</Text><Text>Valeur du stock : {formatMoney(stockValue)}</Text><Text>Catégorie : {product.data.category?.name??'Sans catégorie'}</Text><Text>Fournisseur : {product.data.supplier?.name??'Sans fournisseur'}</Text></Card.Content></Card>}
    {id&&!!levels.data?.some(level=>level.variant)&&<Card><Card.Title title="Détail par variante"/><Card.Content>{levels.data.map(level=><Text key={level.id}>{level.variant?.name??'Produit simple'} : {Number(level.quantity).toFixed(3)}</Text>)}</Card.Content></Card>}
    {id&&<Variants productId={id} companyId={company} variants={product.data?.product_variants??[]} refresh={()=>qc.invalidateQueries({queryKey:['product',id]})}/>}
    {id&&<AppButton mode="outlined" textColor="#C92A2A" onPress={()=>setConfirm(true)}>Supprimer le produit</AppButton>}
    <ConfirmDialog visible={confirm} title="Supprimer ce produit ?" message="Cette action est refusée si le produit est déjà utilisé dans une opération." destructive loading={remove.isPending} onCancel={()=>setConfirm(false)} onConfirm={()=>remove.mutate()}/>
    {id&&<StockAdjustmentDialog visible={!!adjust} onDismiss={()=>setAdjust(null)} companyId={company} storeId={store} storeName={membership?.storeName} productId={id} currentQuantity={stockQuantity} initialDirection={adjust??'in'} variants={product.data?.product_variants??[]}/>}
  </AdminPage>;
}

function Variants({ productId, companyId, variants, refresh }: { productId:string; companyId:string; variants:ProductVariant[]; refresh:()=>Promise<unknown> }) {
  const [open,setOpen]=useState(false); const [editing,setEditing]=useState<ProductVariant|null>(null); const [deleting,setDeleting]=useState<ProductVariant|null>(null);
  const { control,handleSubmit,reset }=useForm<VariantInput>({resolver:zodResolver(variantSchema),defaultValues:{name:'',sku:'',barcode:'',purchasePrice:'',salePrice:'',isActive:true}});
  useEffect(()=>reset(editing?{name:editing.name,sku:editing.sku,barcode:editing.barcode??'',purchasePrice:editing.purchase_price==null?'':String(editing.purchase_price),salePrice:editing.sale_price==null?'':String(editing.sale_price),isActive:editing.is_active}:{name:'',sku:'',barcode:'',purchasePrice:'',salePrice:'',isActive:true}),[editing,reset]);
  const save=useMutation({mutationFn:(v:VariantInput)=>saveVariant(companyId,productId,v,editing?.id),onSuccess:async()=>{await refresh();setOpen(false);setEditing(null)}});
  const remove=useMutation({mutationFn:()=>deleteVariant(deleting!.id),onSuccess:async()=>{await refresh();setDeleting(null)}});
  const show=(v?:ProductVariant)=>{setEditing(v??null);setOpen(true)};
  return <><Card><Card.Title title="Variantes" subtitle={`${variants.length} variante(s)`} right={()=><FAB size="small" icon="plus" style={{marginRight:12}} onPress={()=>show()}/>}/><Card.Content>{variants.map(v=><Card key={v.id} mode="outlined" onPress={()=>show(v)} style={{marginBottom:8}}><Card.Title title={v.name} subtitle={v.sku} right={()=><AppButton mode="text" textColor="#C92A2A" onPress={()=>setDeleting(v)}>Retirer</AppButton>}/></Card>)}{!variants.length&&<Text>Aucune variante. Le produit simple reste utilisable.</Text>}</Card.Content></Card>
    <Portal><Dialog visible={open} onDismiss={()=>setOpen(false)}><Dialog.Title>{editing?'Modifier la variante':'Nouvelle variante'}</Dialog.Title><Dialog.ScrollArea style={{paddingHorizontal:0}}><ScrollView contentContainerStyle={{gap:12,paddingHorizontal:24,paddingBottom:12}} keyboardShouldPersistTaps="handled"><FormField control={control} name="name" label="Nom"/><FormField control={control} name="sku" label="SKU"/><FormField control={control} name="barcode" label="Code-barres"/><FormField control={control} name="purchasePrice" label="Prix d’achat spécifique" keyboardType="decimal-pad"/><FormField control={control} name="salePrice" label="Prix de vente spécifique" keyboardType="decimal-pad"/><Controller control={control} name="isActive" render={({field})=><Card mode="outlined"><Card.Title title="Variante active" right={()=><Switch value={field.value} onValueChange={field.onChange} style={{marginRight:12}}/>}/></Card>}/>{!!save.error&&<HelperText type="error" visible>{save.error.message}</HelperText>}</ScrollView></Dialog.ScrollArea><Dialog.Actions><AppButton mode="text" onPress={()=>setOpen(false)}>Annuler</AppButton><AppButton loading={save.isPending} onPress={handleSubmit(v=>save.mutate(v))}>Enregistrer</AppButton></Dialog.Actions></Dialog></Portal>
    <ConfirmDialog visible={!!deleting} title="Supprimer la variante ?" message="Cette action est définitive." destructive loading={remove.isPending} onCancel={()=>setDeleting(null)} onConfirm={()=>remove.mutate()}/>
  </>;
}
