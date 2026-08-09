import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { Card, Checkbox, Dialog, FAB, HelperText, Portal, Text } from 'react-native-paper';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/forms/FormField';
import { useAuth } from '@/features/auth/AuthProvider';
import { deleteRole, getPermissions, getRoles, saveRole } from '@/features/employees/api';
import { roleSchema, RoleInput } from '@/schemas/organization';
import type { EmployeeRole } from '@/types/database';

export default function RolesScreen() {
  const { membership } = useAuth();
  const companyId = membership?.companyId ?? '';
  const qc = useQueryClient();
  const { width } = useWindowDimensions();
  const [open,setOpen] = useState(false);
  const [editing,setEditing] = useState<EmployeeRole|null>(null);
  const [deleting,setDeleting] = useState<EmployeeRole|null>(null);
  const roles = useQuery({queryKey:['roles',companyId],queryFn:()=>getRoles(companyId),enabled:!!companyId});
  const permissions = useQuery({queryKey:['permissions'],queryFn:getPermissions});
  const { control,handleSubmit,reset } = useForm<RoleInput>({resolver:zodResolver(roleSchema),defaultValues:{name:'',permissions:[]}});

  useEffect(()=>reset(editing?{name:editing.name,permissions:editing.permissions}:{name:'',permissions:[]}),[editing,reset]);
  const save = useMutation({mutationFn:(v:RoleInput)=>saveRole(companyId,v,editing?.id),onSuccess:async()=>{await qc.invalidateQueries({queryKey:['roles',companyId]});setOpen(false);setEditing(null)}});
  const remove = useMutation({mutationFn:deleteRole,onSuccess:async()=>{await qc.invalidateQueries({queryKey:['roles',companyId]});setDeleting(null)}});
  const employeeRoles=(roles.data??[]).filter(role=>role.code==='employee');
  const show=(role?:EmployeeRole)=>{save.reset();setEditing(role??null);setOpen(true)};
  const presets = [
    { label: 'Manager', codes: ['stores.read','stores.write','products.read','products.write','categories.read','categories.write','suppliers.read','suppliers.write','product_variants.read','product_variants.write','stock_movements.read','stock_movements.write','sales.read','sales.write','expenses.read','expenses.write','cash_transactions.read','cash_transactions.write','daily_reports.read','monthly_reports.read'] },
    { label: 'Employé', codes: ['stores.read','products.read','categories.read','suppliers.read','stock_movements.read','sales.read','sales.write','cash_transactions.read','cash_transactions.write'] },
    { label: 'Comptable', codes: ['stores.read','sales.read','purchases.read','payments.read','expenses.read','expenses.write','cash_transactions.read','daily_reports.read','monthly_reports.read'] },
  ];

  return <AdminPage title="Rôles et permissions" action={<FAB size="small" icon="plus" onPress={()=>show()}/> }>
    {!!roles.error&&<HelperText type="error" visible>Impossible de charger les rôles : {roles.error.message}</HelperText>}
    {employeeRoles.length?employeeRoles.map(role=><Card key={role.id} onPress={()=>show(role)}><Card.Title title={role.name} subtitle={`${role.permissions.length} permission(s)`}/><Card.Actions><AppButton mode="text" onPress={()=>show(role)}>Modifier</AppButton><AppButton mode="text" textColor="#C92A2A" onPress={()=>setDeleting(role)}>Supprimer</AppButton></Card.Actions></Card>):!roles.isLoading&&<EmptyState icon="shield-plus" title="Aucun rôle employé" message="Créez un rôle avant d’inviter votre premier employé."/>}

    <Portal><Dialog visible={open} onDismiss={()=>setOpen(false)} style={[styles.dialog,{width:Math.min(width-24,680)}]}>
      <Dialog.Title>{editing?'Modifier le rôle':'Nouveau rôle'}</Dialog.Title>
      <Dialog.ScrollArea style={{paddingHorizontal:0}}>
        <ScrollView contentContainerStyle={{paddingHorizontal:24,paddingBottom:12}} keyboardShouldPersistTaps="handled">
          <FormField control={control} name="name" label="Nom du rôle"/>
          <Controller control={control} name="permissions" render={({field,fieldState})=><View>
            <Text variant="labelLarge">Modèles rapides</Text>
            <View style={styles.presetRow}>{presets.map(preset=><AppButton key={preset.label} compact mode="outlined" onPress={()=>field.onChange(preset.codes.filter(code=>(permissions.data??[]).some(permission=>permission.code===code)))}>{preset.label}</AppButton>)}</View>
            <View style={styles.toolbar}><AppButton compact mode="text" onPress={()=>field.onChange([])}>Tout retirer</AppButton></View>
            {(permissions.data??[]).map(permission=>{const checked=field.value.includes(permission.code);return <Checkbox.Item style={styles.permission} key={permission.id} label={permission.description??permission.code} status={checked?'checked':'unchecked'} onPress={()=>{
              if(checked){const linked=permission.code.endsWith('.read')?permission.code.replace(/\.read$/,'.write'):'';field.onChange(field.value.filter(code=>code!==permission.code&&code!==linked));return}
              const next=[...field.value,permission.code];const read=permission.code.endsWith('.write')?permission.code.replace(/\.write$/,'.read'):'';field.onChange(read&&(permissions.data??[]).some(item=>item.code===read)?[...new Set([...next,read])]:next);
            }}/>})}
            {permissions.isLoading&&<Text>Chargement des permissions…</Text>}
            {!!permissions.error&&<HelperText type="error" visible>{permissions.error.message}</HelperText>}
            <HelperText type="error" visible={!!fieldState.error}>{fieldState.error?.message}</HelperText>
          </View>}/>
          {!!save.error&&<HelperText type="error" visible>{save.error.message}</HelperText>}
        </ScrollView>
      </Dialog.ScrollArea>
      <Dialog.Actions><AppButton mode="text" onPress={()=>setOpen(false)}>Annuler</AppButton><AppButton disabled={permissions.isLoading} onPress={handleSubmit(values=>save.mutate(values))} loading={save.isPending}>Enregistrer</AppButton></Dialog.Actions>
    </Dialog></Portal>

    <ConfirmDialog visible={!!deleting} title="Supprimer ce rôle ?" message="La suppression est refusée s’il est encore attribué à un employé." destructive loading={remove.isPending} onCancel={()=>setDeleting(null)} onConfirm={()=>deleting&&remove.mutate(deleting.id)}/>
  </AdminPage>;
}

const styles=StyleSheet.create({
  dialog:{alignSelf:'center',maxWidth:680,maxHeight:'92%',marginHorizontal:12},
  presetRow:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:8,marginBottom:10},
  toolbar:{flexDirection:'row',justifyContent:'flex-end',marginBottom:4},
  permission:{paddingHorizontal:0},
});
