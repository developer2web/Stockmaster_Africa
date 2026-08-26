import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import { useEffect,useMemo,useState } from 'react';
import { Controller,useForm } from 'react-hook-form';
import { Card,Dialog,FAB,HelperText,Portal,Switch,Text } from 'react-native-paper';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppSearchBar } from '@/components/ui/AppSearchBar';
import { FormField } from '@/components/forms/FormField';
import { useAuth } from '@/features/auth/AuthProvider';
import { getCategories,saveCategory } from '@/features/products/api';
import { categorySchema,type CategoryInput } from '@/schemas/catalog';
import type { Category } from '@/types/database';

export default function Categories(){
  const{membership}=useAuth();const company=membership?.companyId??'';const store=membership?.storeId??'';const qc=useQueryClient();
  const[open,setOpen]=useState(false);const[editing,setEditing]=useState<Category|null>(null);const[search,setSearch]=useState('');
  const query=useQuery({queryKey:['categories',company,store],queryFn:()=>getCategories(company,store),enabled:!!company&&!!store});
  const shown=useMemo(()=>{const term=search.trim().toLowerCase();return(query.data??[]).filter(item=>!term||`${item.name} ${item.description??''}`.toLowerCase().includes(term))},[query.data,search]);
  const{control,handleSubmit,reset}=useForm<CategoryInput>({resolver:zodResolver(categorySchema),defaultValues:{name:'',description:'',isActive:true}});
  useEffect(()=>reset(editing?{name:editing.name,description:editing.description??'',isActive:editing.is_active}:{name:'',description:'',isActive:true}),[editing,reset]);
  const mutation=useMutation({mutationFn:(value:CategoryInput)=>saveCategory(company,store,value,editing?.id),onSuccess:async()=>{await qc.invalidateQueries({queryKey:['categories',company,store]});setOpen(false);setEditing(null)}});
  const show=(item?:Category)=>{mutation.reset();setEditing(item??null);setOpen(true)};
  return <AdminPage title="Catégories" action={<FAB size="small" icon="plus" accessibilityLabel="Ajouter une catégorie" onPress={()=>show()}/>}>
    <AppSearchBar placeholder="Rechercher une catégorie" value={search} onChangeText={setSearch}/>
    {!!query.error&&<HelperText type="error" visible>{query.error.message}</HelperText>}
    {shown.map(item=><Card key={item.id} mode="outlined" onPress={()=>show(item)}><Card.Title title={item.name} subtitle={item.description||'Sans description'} right={()=><Text style={{marginRight:16}}>{item.is_active?'Active':'Archivée'}</Text>}/></Card>)}
    {!query.isLoading&&!shown.length&&<EmptyState icon={search?'magnify':'shape-plus'} title={search?'Aucun résultat':'Aucune catégorie'} message={search?'Modifiez votre recherche.':'Créez une catégorie pour organiser le catalogue.'}/>}
    <Portal><Dialog visible={open} onDismiss={()=>setOpen(false)}><Dialog.Title>{editing?'Modifier la catégorie':'Nouvelle catégorie'}</Dialog.Title><Dialog.Content>
      <FormField control={control} name="name" label="Nom"/><FormField control={control} name="description" label="Description" multiline/>
      <Controller control={control} name="isActive" render={({field})=><Card mode="outlined"><Card.Title title="Catégorie active" right={()=><Switch value={field.value} onValueChange={field.onChange} style={{marginRight:12}}/>}/></Card>}/>
      {!!mutation.error&&<HelperText type="error" visible>{mutation.error.message}</HelperText>}
    </Dialog.Content><Dialog.Actions style={{ flexWrap: 'wrap' }}><AppButton mode="text" onPress={()=>setOpen(false)}>Annuler</AppButton><AppButton loading={mutation.isPending} disabled={mutation.isPending} onPress={handleSubmit(value=>mutation.mutate(value))}>Enregistrer</AppButton></Dialog.Actions></Dialog></Portal>
  </AdminPage>;
}
