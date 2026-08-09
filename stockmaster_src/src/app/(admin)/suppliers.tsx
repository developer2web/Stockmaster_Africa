import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import { useEffect,useMemo,useState } from 'react';
import { Controller,useForm } from 'react-hook-form';
import { ScrollView } from 'react-native';
import { Card,Dialog,FAB,HelperText,Portal,Searchbar,Switch,Text } from 'react-native-paper';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/forms/FormField';
import { useAuth } from '@/features/auth/AuthProvider';
import { getSuppliers,saveSupplier } from '@/features/products/api';
import { supplierSchema,type SupplierInput } from '@/schemas/catalog';
import type { Supplier } from '@/types/database';

export default function Suppliers(){
  const{membership}=useAuth();const company=membership?.companyId??'';const store=membership?.storeId??'';const qc=useQueryClient();
  const[open,setOpen]=useState(false);const[editing,setEditing]=useState<Supplier|null>(null);const[search,setSearch]=useState('');
  const query=useQuery({queryKey:['suppliers',company,store],queryFn:()=>getSuppliers(company,store),enabled:!!company&&!!store});
  const shown=useMemo(()=>{const term=search.trim().toLowerCase();return(query.data??[]).filter(item=>!term||`${item.name} ${item.email??''} ${item.phone??''}`.toLowerCase().includes(term))},[query.data,search]);
  const{control,handleSubmit,reset}=useForm<SupplierInput>({resolver:zodResolver(supplierSchema),defaultValues:{name:'',email:'',phone:'',address:'',isActive:true}});
  useEffect(()=>reset(editing?{name:editing.name,email:editing.email??'',phone:editing.phone??'',address:editing.address??'',isActive:editing.is_active}:{name:'',email:'',phone:'',address:'',isActive:true}),[editing,reset]);
  const mutation=useMutation({mutationFn:(value:SupplierInput)=>saveSupplier(company,store,value,editing?.id),onSuccess:async()=>{await qc.invalidateQueries({queryKey:['suppliers',company,store]});setOpen(false);setEditing(null)}});
  const show=(item?:Supplier)=>{mutation.reset();setEditing(item??null);setOpen(true)};
  return <AdminPage title="Fournisseurs" action={<FAB size="small" icon="plus" accessibilityLabel="Ajouter un fournisseur" onPress={()=>show()}/>}>
    <Searchbar placeholder="Nom, email ou téléphone" value={search} onChangeText={setSearch}/>
    {!!query.error&&<HelperText type="error" visible>{query.error.message}</HelperText>}
    {shown.map(item=><Card key={item.id} mode="outlined" onPress={()=>show(item)}><Card.Title title={item.name} subtitle={[item.email,item.phone].filter(Boolean).join(' • ')||'Aucun contact'} right={()=><Text style={{marginRight:16}}>{item.is_active?'Actif':'Archivé'}</Text>}/></Card>)}
    {!query.isLoading&&!shown.length&&<EmptyState icon={search?'magnify':'truck-plus'} title={search?'Aucun résultat':'Aucun fournisseur'} message={search?'Modifiez votre recherche.':'Ajoutez votre premier fournisseur.'}/>}
    <Portal><Dialog visible={open} onDismiss={()=>setOpen(false)}><Dialog.Title>{editing?'Modifier le fournisseur':'Nouveau fournisseur'}</Dialog.Title><Dialog.ScrollArea style={{paddingHorizontal:0}}><ScrollView contentContainerStyle={{gap:12,paddingHorizontal:24,paddingBottom:12}} keyboardShouldPersistTaps="handled">
      <FormField control={control} name="name" label="Nom"/><FormField control={control} name="email" label="Email" keyboardType="email-address" autoCapitalize="none"/><FormField control={control} name="phone" label="Téléphone" keyboardType="phone-pad"/><FormField control={control} name="address" label="Adresse" multiline/>
      <Controller control={control} name="isActive" render={({field})=><Card mode="outlined"><Card.Title title="Fournisseur actif" right={()=><Switch value={field.value} onValueChange={field.onChange} style={{marginRight:12}}/>}/></Card>}/>
      {!!mutation.error&&<HelperText type="error" visible>{mutation.error.message}</HelperText>}
    </ScrollView></Dialog.ScrollArea><Dialog.Actions><AppButton mode="text" onPress={()=>setOpen(false)}>Annuler</AppButton><AppButton loading={mutation.isPending} disabled={mutation.isPending} onPress={handleSubmit(value=>mutation.mutate(value))}>Enregistrer</AppButton></Dialog.Actions></Dialog></Portal>
  </AdminPage>;
}
