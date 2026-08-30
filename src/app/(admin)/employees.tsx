import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ScrollView } from 'react-native';
import { Card, Checkbox, Dialog, HelperText, Portal, Switch, Text } from 'react-native-paper';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/forms/FormField';
import { SelectField } from '@/components/forms/SelectField';
import { useAuth } from '@/features/auth/AuthProvider';
import { deleteEmployee, getEmployees, getRoles, getStores, inviteEmployee, updateEmployee } from '@/features/employees/api';
import { employeeSchema, EmployeeInput } from '@/schemas/organization';
import type { Employee } from '@/types/database';
import { useSubscription } from '@/features/subscriptions/SubscriptionProvider';
import { router } from 'expo-router';
import { StatusChip } from '@/components/ui/StatusChip';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

const inviteDefaults: EmployeeInput = { fullName:'', email:'', roleId:'', storeIds:[], allStores:false };

export default function EmployeesScreen() {
  const { membership } = useAuth();
  const { getSubscriptionLimits, isLoading: subscriptionLoading } = useSubscription();
  const companyId = membership?.companyId ?? '';
  const qc = useQueryClient();
  const [inviteOpen,setInviteOpen] = useState(false);
  const [editing,setEditing] = useState<Employee|null>(null);
  const [editRole,setEditRole] = useState('');
  const [editStores,setEditStores] = useState<string[]>([]);
  const [editAllStores,setEditAllStores] = useState(false);
  const [editActive,setEditActive] = useState(true);
  const [deleteConfirm,setDeleteConfirm] = useState(false);
  const employees = useQuery({queryKey:['employees',companyId],queryFn:()=>getEmployees(companyId),enabled:!!companyId});
  const roles = useQuery({queryKey:['roles',companyId],queryFn:()=>getRoles(companyId),enabled:!!companyId});
  const stores = useQuery({queryKey:['stores',companyId],queryFn:()=>getStores(companyId),enabled:!!companyId});
  const { control,handleSubmit,reset } = useForm<EmployeeInput>({resolver:zodResolver(employeeSchema),defaultValues:inviteDefaults});
  const invite = useMutation({mutationFn:(values:EmployeeInput)=>inviteEmployee(values,companyId),onSuccess:async()=>{await qc.invalidateQueries({queryKey:['employees',companyId]});setInviteOpen(false)}});
  const update = useMutation({mutationFn:(v:{roleId:string;storeIds:string[];allStores:boolean;active:boolean})=>updateEmployee(editing!.id,v.roleId,v.storeIds,v.allStores,v.active),onSuccess:async()=>{await qc.invalidateQueries({queryKey:['employees',companyId]});setEditing(null)}});
  const remove = useMutation({mutationFn:()=>deleteEmployee(editing!.id),onSuccess:async()=>{await qc.invalidateQueries({queryKey:['employees',companyId]});setDeleteConfirm(false);setEditing(null)}});
  const defaultRoleOrder: Record<string, number> = { Manager: 0, 'Employé': 1, Comptable: 2 };
  const roleOptions=(roles.data??[])
    .filter(r=>r.code==='employee')
    .sort((a,b)=>(defaultRoleOrder[a.name]??99)-(defaultRoleOrder[b.name]??99)||a.name.localeCompare(b.name))
    .map(r=>({label:r.name,value:r.id}));
  const employeeLimit = getSubscriptionLimits().maxEmployees;
  const activeEmployeeCount = employees.data?.filter(employee=>employee.isActive).length ?? 0;
  const canInvite = subscriptionLoading || activeEmployeeCount < employeeLimit;
  const openInvite=()=>{reset({...inviteDefaults,roleId:roleOptions[0]?.value??''});invite.reset();setInviteOpen(true)};
  const openEmployee=(employee:Employee)=>{setEditRole(employee.roleId);setEditStores(employee.storeIds);setEditAllStores(employee.allStores);setEditActive(employee.isActive);update.reset();remove.reset();setEditing(employee)};

  return <AdminPage title="Employés" action={<AppButton icon={canInvite?'account-plus':'lock-outline'} onPress={()=>canInvite?openInvite():router.push('/(subscription)' as never)}>{canInvite?'Ajouter':'Forfait requis'}</AppButton>}>
    <Card mode="outlined"><Card.Content><Text variant="titleMedium">Invitation sécurisée par email</Text><Text>L’employé reçoit un lien personnel pour confirmer son adresse et choisir lui-même son mot de passe. Aucun mot de passe n’est visible par l’Admin.</Text></Card.Content></Card>
    {!subscriptionLoading&&<HelperText type={canInvite?'info':'error'} visible>{activeEmployeeCount}/{employeeLimit} employé(s) actif(s) autorisé(s) par le forfait.</HelperText>}
    {!!roles.error&&<HelperText type="error" visible>Impossible de charger les rôles : {roles.error.message}</HelperText>}
    {!roles.isLoading&&!roleOptions.length&&<Card mode="outlined"><Card.Content><Text>Créez au moins un rôle employé avant d’envoyer une invitation.</Text></Card.Content></Card>}
    {employees.data?.length?employees.data.map(e=><Card key={e.id} onPress={()=>openEmployee(e)}><Card.Title title={e.fullName} subtitle={`${e.roleName} • ${e.allStores?'Toutes les boutiques':e.storeNames.join(', ')||'Aucune boutique'}`} right={()=><StatusChip style={{marginRight:12}} status={e.isActive?'active':'suspended'}/>} /></Card>):<EmptyState icon="account-multiple-plus" title="Aucun employé" message="Invitez votre équipe et attribuez précisément ses accès."/>}
    <Portal><Dialog visible={inviteOpen} onDismiss={()=>setInviteOpen(false)}><Dialog.Title>Ajouter un employé</Dialog.Title><Dialog.ScrollArea style={{paddingHorizontal:0}}><ScrollView nestedScrollEnabled contentContainerStyle={{gap:12,paddingHorizontal:24,paddingBottom:12}} keyboardShouldPersistTaps="handled"><FormField control={control} name="fullName" label="Nom complet"/><FormField control={control} name="email" label="Email" keyboardType="email-address" autoCapitalize="none"/><Controller control={control} name="roleId" render={({field,fieldState})=><SelectField label="Rôle" value={field.value} options={roleOptions} onChange={v=>field.onChange(v??'')} error={fieldState.error?.message}/>}/><Controller control={control} name="allStores" render={({field})=><Checkbox.Item label="Accès à toutes les boutiques" status={field.value?'checked':'unchecked'} onPress={()=>field.onChange(!field.value)}/>}/><Controller control={control} name="storeIds" render={({field,fieldState})=><Card mode="outlined"><Card.Title title="Boutiques autorisées"/><Card.Content>{(stores.data??[]).filter(s=>s.is_active).map(store=><Checkbox.Item key={store.id} label={store.name} status={field.value.includes(store.id)?'checked':'unchecked'} onPress={()=>field.onChange(field.value.includes(store.id)?field.value.filter(id=>id!==store.id):[...field.value,store.id])}/>) }{!!fieldState.error&&<HelperText type="error" visible>{fieldState.error.message}</HelperText>}</Card.Content></Card>}/>{!!invite.error&&<HelperText type="error" visible>{invite.error.message}</HelperText>}</ScrollView></Dialog.ScrollArea><Dialog.Actions style={{ flexWrap: 'wrap' }}><AppButton mode="text" onPress={()=>setInviteOpen(false)}>Annuler</AppButton><AppButton disabled={!roleOptions.length} loading={invite.isPending} onPress={handleSubmit(v=>invite.mutate(v))}>Ajouter</AppButton></Dialog.Actions></Dialog></Portal>
    <Portal><Dialog visible={!!editing} dismissable={!update.isPending&&!remove.isPending} onDismiss={()=>!update.isPending&&!remove.isPending&&setEditing(null)}><Dialog.Title>Accès de {editing?.fullName}</Dialog.Title><Dialog.ScrollArea style={{paddingHorizontal:0}}><ScrollView nestedScrollEnabled contentContainerStyle={{gap:12,paddingHorizontal:24,paddingBottom:12}} keyboardShouldPersistTaps="handled"><SelectField label="Rôle" value={editRole} options={roleOptions} onChange={v=>setEditRole(v??'')}/><Checkbox.Item label="Toutes les boutiques" status={editAllStores?'checked':'unchecked'} onPress={()=>setEditAllStores(value=>!value)}/>{!editAllStores&&(stores.data??[]).filter(s=>s.is_active).map(store=><Checkbox.Item key={store.id} label={store.name} status={editStores.includes(store.id)?'checked':'unchecked'} onPress={()=>setEditStores(current=>current.includes(store.id)?current.filter(id=>id!==store.id):[...current,store.id])}/>) }<Card mode="outlined"><Card.Title title="Compte actif" right={()=><Switch value={editActive} onValueChange={setEditActive} style={{marginRight:12}}/>}/></Card>{!!update.error&&<HelperText type="error" visible>{update.error.message}</HelperText>}{!!remove.error&&<HelperText type="error" visible>{remove.error.message}</HelperText>}</ScrollView></Dialog.ScrollArea><Dialog.Actions style={{ flexWrap: 'wrap' }}><AppButton mode="text" destructive onPress={()=>setDeleteConfirm(true)}>Supprimer</AppButton><AppButton mode="text" onPress={()=>setEditing(null)}>Annuler</AppButton><AppButton disabled={!editRole||(!editAllStores&&!editStores.length)} loading={update.isPending} onPress={()=>update.mutate({roleId:editRole,storeIds:editStores,allStores:editAllStores,active:editActive})}>Enregistrer</AppButton></Dialog.Actions></Dialog></Portal>
    <ConfirmDialog visible={deleteConfirm} title="Supprimer cet employé ?" message="Son accès à cette entreprise sera retiré. Cette action est réservée aux administrateurs." destructive loading={remove.isPending} onCancel={()=>setDeleteConfirm(false)} onConfirm={()=>remove.mutate()}/>
  </AdminPage>;
}
