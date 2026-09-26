import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Card, Checkbox, Dialog, HelperText, Icon, Portal, Switch, Text, TextInput, useTheme } from 'react-native-paper';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/forms/FormField';
import { SelectField } from '@/components/forms/SelectField';
import { useAuth } from '@/features/auth/AuthProvider';
import { deleteEmployee, deleteEmployeeAccount, getEmployees, getRoles, getStores, inviteEmployee, updateEmployee, type EmployeeInviteResult } from '@/features/employees/api';
import { employeeSchema, EmployeeInput } from '@/schemas/organization';
import type { Employee } from '@/types/database';
import { useSubscription } from '@/features/subscriptions/SubscriptionProvider';
import { StatusChip } from '@/components/ui/StatusChip';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import * as Clipboard from 'expo-clipboard';
import { openAccountPortal } from '@/features/subscriptions/accountPortal';
import { listEmployeeAccessRemovalRequests, processEmployeeAccessRemovalRequest, type PendingAccessRemovalRequest } from '@/features/account/api';

const inviteDefaults: EmployeeInput = { fullName:'', email:'', roleId:'', storeIds:[], allStores:false };
const EMPLOYEE_PAGE_SIZE = 20;

const initials = (name: string) => name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]!.toUpperCase()).join('') || '?';

export default function EmployeesScreen() {
  const theme = useTheme();
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
  const [deleteAccountConfirm,setDeleteAccountConfirm] = useState(false);
  const [deleteReason,setDeleteReason] = useState('');
  const [deleteAccountReason,setDeleteAccountReason] = useState('');
  const [temporaryCredentials,setTemporaryCredentials] = useState<(EmployeeInviteResult & { email:string })|null>(null);
  const [successMessage,setSuccessMessage] = useState('');
  const [passwordCopied,setPasswordCopied] = useState(false);
  const [visibleCount,setVisibleCount] = useState(EMPLOYEE_PAGE_SIZE);
  const employees = useQuery({queryKey:['employees',companyId],queryFn:()=>getEmployees(companyId),enabled:!!companyId});
  // Retour testeur du 26/09 : les demandes de retrait d'accès s'affichent directement
  // sur la fiche de l'employé concerné, avec Approuver (retire l'accès) / Refuser.
  const removalRequests = useQuery({queryKey:['employee-access-removal-requests',companyId],queryFn:()=>listEmployeeAccessRemovalRequests(companyId),enabled:!!companyId});
  const requestByUser = new Map((removalRequests.data??[]).map(request=>[request.userId,request]));
  const [review,setReview] = useState<{request:PendingAccessRemovalRequest;employee:Employee;approve:boolean}|null>(null);
  const [reviewNote,setReviewNote] = useState('');
  const processRequest = useMutation({mutationFn:()=>processEmployeeAccessRemovalRequest(review!.request.id,review!.approve,reviewNote),onSuccess:async()=>{const approved=review!.approve;const name=review!.employee.fullName;await Promise.all([qc.invalidateQueries({queryKey:['employees',companyId]}),qc.invalidateQueries({queryKey:['employee-access-removal-requests',companyId]})]);setReview(null);setReviewNote('');setSuccessMessage(approved?`✓ Accès de ${name} retiré.`:`✓ Demande de ${name} refusée — l’employé a été notifié.`);}});
  // The full list stays loaded (bounded by the plan's own employee limit) so the
  // count below is always accurate; only the rendered cards are paged for a
  // smoother scroll on a company with many employees. Employees with a pending
  // removal request come first so the administrator never has to hunt for them.
  const sortedEmployees = [...(employees.data??[])].sort((a,b)=>Number(requestByUser.has(b.userId))-Number(requestByUser.has(a.userId)));
  const visibleEmployees = sortedEmployees.slice(0, visibleCount);
  const roles = useQuery({queryKey:['roles',companyId],queryFn:()=>getRoles(companyId),enabled:!!companyId});
  const stores = useQuery({queryKey:['stores',companyId],queryFn:()=>getStores(companyId),enabled:!!companyId});
  const { control,handleSubmit,reset,watch } = useForm<EmployeeInput>({resolver:zodResolver(employeeSchema),defaultValues:inviteDefaults});
  const allStores = watch('allStores');
  const invite = useMutation({mutationFn:(values:EmployeeInput)=>inviteEmployee(values,companyId).then(result=>({...result,email:values.email.trim().toLowerCase()})),onSuccess:async(result)=>{await qc.invalidateQueries({queryKey:['employees',companyId]});setInviteOpen(false);if(result.reactivated){setTemporaryCredentials(null);setSuccessMessage('✓ Employé réactivé avec les nouveaux accès.');}else{setSuccessMessage('');setTemporaryCredentials(result)}}});
  const update = useMutation({mutationFn:(v:{roleId:string;storeIds:string[];allStores:boolean;active:boolean})=>updateEmployee(editing!.id,v.roleId,v.storeIds,v.allStores,v.active),onSuccess:async()=>{await qc.invalidateQueries({queryKey:['employees',companyId]});setEditing(null)}});
  const remove = useMutation({mutationFn:()=>deleteEmployee(editing!.id,deleteReason),onSuccess:async()=>{await qc.invalidateQueries({queryKey:['employees',companyId]});setDeleteConfirm(false);setDeleteReason('');setEditing(null)}});
  const removeAccount = useMutation({mutationFn:()=>deleteEmployeeAccount(editing!.id,deleteAccountReason),onSuccess:async()=>{await qc.invalidateQueries({queryKey:['employees',companyId]});setDeleteAccountConfirm(false);setDeleteAccountReason('');setEditing(null)}});
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

  return <AdminPage title="Employés" action={<AppButton icon={canInvite?'account-plus':'lock-outline'} onPress={()=>canInvite?openInvite():void openAccountPortal(companyId).catch(()=>undefined)}>{canInvite?'Ajouter':'Forfait requis'}</AppButton>}>
    <View style={[styles.hero, { backgroundColor: theme.colors.primaryContainer }]}>
      <Text style={{ color: theme.colors.onPrimaryContainer }}>Employés actifs</Text>
      <Text variant="titleLarge" numberOfLines={1} style={[styles.heroValue, { color: theme.colors.onPrimaryContainer }]}>{subscriptionLoading ? '…' : `${activeEmployeeCount} / ${employeeLimit}`}</Text>
      {!subscriptionLoading && !canInvite && <Text style={{ color: theme.colors.onPrimaryContainer }}>Limite du forfait atteinte</Text>}
    </View>
    <Card mode="outlined"><Card.Content><Text variant="titleMedium">Accès temporaire sécurisé</Text><Text>StockMaster affiche le mot de passe provisoire une seule fois après la création. Transmettez-le directement à l’employé : il devra le remplacer à sa première connexion.</Text></Card.Content></Card>
    {!!successMessage&&<HelperText type="info" visible>{successMessage}</HelperText>}
    {!!roles.error&&<HelperText type="error" visible>Impossible de charger les rôles : {roles.error.message}</HelperText>}
    {!roles.isLoading&&!roleOptions.length&&<Card mode="outlined"><Card.Content><Text>Créez au moins un rôle employé avant d’envoyer une invitation.</Text></Card.Content></Card>}
    {!!removalRequests.error&&<HelperText type="error" visible>Demandes de retrait indisponibles : {removalRequests.error.message}</HelperText>}
    {!!removalRequests.data?.length&&<Card mode="contained" style={{backgroundColor:theme.colors.errorContainer}}><Card.Content style={styles.requestSummary}><Icon source="account-arrow-left-outline" size={24} color={theme.colors.onErrorContainer}/><Text style={{flex:1,color:theme.colors.onErrorContainer,fontWeight:'700'}}>{removalRequests.data.length===1?'1 demande de retrait d’accès à traiter':`${removalRequests.data.length} demandes de retrait d’accès à traiter`}</Text></Card.Content></Card>}
    {employees.data?.length?visibleEmployees.map(e=>{const request=requestByUser.get(e.userId);return <Card key={e.id} onPress={()=>openEmployee(e)} style={request?{borderWidth:1,borderColor:theme.colors.error}:undefined}><Card.Title title={e.fullName} subtitle={`${e.roleName} • ${e.allStores?'Toutes les boutiques':e.storeNames.join(', ')||'Aucune boutique'}`} left={()=><View style={[styles.avatar,{backgroundColor:theme.colors.secondaryContainer}]}><Text style={[styles.avatarText,{color:theme.colors.secondary}]}>{initials(e.fullName)}</Text></View>} right={()=><StatusChip style={{marginRight:12}} status={e.isActive?'active':'suspended'}/>} />{!!request&&<Card.Content style={styles.requestBlock}><Text variant="titleSmall" style={{color:theme.colors.error,fontWeight:'800'}}>Demande de retrait d’accès</Text><Text>Envoyée le {new Date(request.createdAt).toLocaleDateString('fr-FR')}{request.reason?` — Motif : ${request.reason}`:''}</Text><View style={styles.requestActions}><AppButton icon="check" buttonColor="#C92A2A" onPress={()=>{setReviewNote('');processRequest.reset();setReview({request,employee:e,approve:true})}}>Approuver</AppButton><AppButton mode="outlined" icon="close" onPress={()=>{setReviewNote('');processRequest.reset();setReview({request,employee:e,approve:false})}}>Refuser</AppButton></View></Card.Content>}</Card>}):<EmptyState icon="account-multiple-plus" title="Aucun employé" message="Invitez votre équipe et attribuez précisément ses accès."/>}
    {(employees.data?.length??0)>visibleEmployees.length&&<AppButton mode="outlined" onPress={()=>setVisibleCount(count=>count+EMPLOYEE_PAGE_SIZE)}>Charger plus d’employés</AppButton>}
    <Portal><Dialog visible={!!review} dismissable={!processRequest.isPending} onDismiss={()=>!processRequest.isPending&&setReview(null)} style={styles.reviewDialog}><Dialog.Title>{review?.approve?'Approuver le retrait':'Refuser la demande'}</Dialog.Title><Dialog.Content style={{gap:10}}><Text>{review?.approve?`L’accès de ${review?.employee.fullName} à cette entreprise sera retiré immédiatement. Son historique (ventes, caisse…) est conservé.`:`${review?.employee.fullName} gardera son accès et sera notifié du refus.`}</Text><TextInput mode="outlined" label={review?.approve?'Motif (facultatif)':'Motif du refus (facultatif, visible par l’employé)'} accessibilityLabel="Motif" value={reviewNote} onChangeText={setReviewNote} multiline/>{!!processRequest.error&&<HelperText type="error" visible>{processRequest.error.message}</HelperText>}</Dialog.Content><Dialog.Actions style={{flexWrap:'wrap'}}><AppButton mode="text" disabled={processRequest.isPending} onPress={()=>setReview(null)}>Annuler</AppButton><AppButton buttonColor={review?.approve?'#C92A2A':undefined} loading={processRequest.isPending} disabled={processRequest.isPending} onPress={()=>processRequest.mutate()}>{review?.approve?'Retirer l’accès':'Refuser la demande'}</AppButton></Dialog.Actions></Dialog></Portal>
    <Portal><Dialog visible={inviteOpen} onDismiss={()=>setInviteOpen(false)}><Dialog.Title>Ajouter un employé</Dialog.Title><Dialog.ScrollArea style={{paddingHorizontal:0}}><ScrollView nestedScrollEnabled contentContainerStyle={{gap:12,paddingHorizontal:24,paddingBottom:12}} keyboardShouldPersistTaps="handled"><FormField control={control} name="fullName" label="Nom complet"/><FormField control={control} name="email" label="Email" keyboardType="email-address" autoCapitalize="none"/><Controller control={control} name="roleId" render={({field,fieldState})=><SelectField label="Rôle" value={field.value} options={roleOptions} onChange={v=>field.onChange(v??'')} error={fieldState.error?.message}/>}/><Controller control={control} name="allStores" render={({field})=><Checkbox.Item label="Accès à toutes les boutiques" status={field.value?'checked':'unchecked'} onPress={()=>field.onChange(!field.value)}/>}/>{!allStores&&<Controller control={control} name="storeIds" render={({field,fieldState})=><Card mode="outlined"><Card.Title title="Boutiques autorisées"/><Card.Content>{(stores.data??[]).filter(s=>s.is_active).map(store=><Checkbox.Item key={store.id} label={store.name} status={field.value.includes(store.id)?'checked':'unchecked'} onPress={()=>field.onChange(field.value.includes(store.id)?field.value.filter(id=>id!==store.id):[...field.value,store.id])}/>)}{!!fieldState.error&&<HelperText type="error" visible>{fieldState.error.message}</HelperText>}</Card.Content></Card>}/>}{!!invite.error&&<HelperText type="error" visible>{invite.error.message}</HelperText>}</ScrollView></Dialog.ScrollArea><Dialog.Actions style={{ flexWrap: 'wrap' }}><AppButton mode="text" onPress={()=>setInviteOpen(false)}>Annuler</AppButton><AppButton disabled={!roleOptions.length} loading={invite.isPending} onPress={handleSubmit(v=>invite.mutate(v))}>Ajouter</AppButton></Dialog.Actions></Dialog></Portal>
    <Portal><Dialog visible={!!temporaryCredentials} dismissable={false}><Dialog.Title>Employé créé</Dialog.Title><Dialog.Content style={{gap:12}}><HelperText type="info" visible>Copiez maintenant ces informations. Le mot de passe ne sera plus affiché après fermeture.</HelperText><Text selectable>Email : {temporaryCredentials?.email}</Text>{temporaryCredentials?.temporaryPassword?<Card mode="contained"><Card.Content style={{gap:10}}><Text variant="labelMedium">Mot de passe temporaire</Text><Text variant="titleLarge" selectable>{temporaryCredentials.temporaryPassword}</Text><AppButton mode="outlined" icon={passwordCopied?'check':'content-copy'} onPress={async()=>{await Clipboard.setStringAsync(temporaryCredentials.temporaryPassword!);setPasswordCopied(true)}}>{passwordCopied?'✓ Copié':'Copier le mot de passe'}</AppButton></Card.Content></Card>:<Text>L’invitation a été envoyée par email.</Text>}</Dialog.Content><Dialog.Actions><AppButton onPress={()=>{setTemporaryCredentials(null);setPasswordCopied(false)}}>Fermer</AppButton></Dialog.Actions></Dialog></Portal>
    <Portal><Dialog visible={!!editing} dismissable={!update.isPending&&!remove.isPending&&!removeAccount.isPending} onDismiss={()=>!update.isPending&&!remove.isPending&&!removeAccount.isPending&&setEditing(null)}><Dialog.Title>Accès de {editing?.fullName}</Dialog.Title><Dialog.ScrollArea style={{paddingHorizontal:0}}><ScrollView nestedScrollEnabled contentContainerStyle={{gap:12,paddingHorizontal:24,paddingBottom:12}} keyboardShouldPersistTaps="handled"><SelectField label="Rôle" value={editRole} options={roleOptions} onChange={v=>setEditRole(v??'')}/><Checkbox.Item label="Toutes les boutiques" status={editAllStores?'checked':'unchecked'} onPress={()=>setEditAllStores(value=>!value)}/>{!editAllStores&&(stores.data??[]).filter(s=>s.is_active).map(store=><Checkbox.Item key={store.id} label={store.name} status={editStores.includes(store.id)?'checked':'unchecked'} onPress={()=>setEditStores(current=>current.includes(store.id)?current.filter(id=>id!==store.id):[...current,store.id])}/>) }<Card mode="outlined"><Card.Title title="Compte actif" right={()=><Switch value={editActive} onValueChange={setEditActive} accessibilityLabel="Compte actif" style={{marginRight:12}}/>}/></Card>{!!update.error&&<HelperText type="error" visible>{update.error.message}</HelperText>}{!!remove.error&&<HelperText type="error" visible>{remove.error.message}</HelperText>}{!!removeAccount.error&&<HelperText type="error" visible>{removeAccount.error.message}</HelperText>}</ScrollView></Dialog.ScrollArea>{/* Audit externe (SM-13) : ces deux actions, destructrices et distinctes
    l'une de l'autre (l'accès à cette entreprise seulement, ou le compte
    StockMaster entier de la personne), étaient visuellement identiques à
    "Annuler" — aucune couleur d'alerte, intitulés proches. Les deux
    dialogues de confirmation expliquaient déjà bien la différence ; ce
    qui manquait, c'était de le voir avant d'en arriver là. */}
<Dialog.Actions style={{ flexWrap: 'wrap' }}><AppButton mode="text" destructive icon="account-remove-outline" onPress={()=>setDeleteConfirm(true)}>Retirer l’accès</AppButton><AppButton mode="text" destructive icon="delete-forever-outline" onPress={()=>setDeleteAccountConfirm(true)}>Supprimer le compte</AppButton><AppButton mode="text" onPress={()=>setEditing(null)}>Annuler</AppButton><AppButton disabled={!editRole||(!editAllStores&&!editStores.length)} loading={update.isPending} onPress={()=>update.mutate({roleId:editRole,storeIds:editStores,allStores:editAllStores,active:editActive})}>Enregistrer</AppButton></Dialog.Actions></Dialog></Portal>
    <ConfirmDialog visible={deleteConfirm} title="Supprimer cet employé ?" message="Son accès à cette entreprise sera retiré (immédiatement s’il n’a aucun historique de vente, dépense ou mouvement ; sinon son accès est simplement désactivé, ses opérations passées restent conservées). Son compte StockMaster personnel n’est pas supprimé : il garde son adresse email et pourrait s’en servir pour une autre entreprise." destructive loading={remove.isPending} reason={deleteReason} onReasonChange={setDeleteReason} onCancel={()=>{setDeleteConfirm(false);setDeleteReason('')}} onConfirm={()=>remove.mutate()}/>
    <ConfirmDialog visible={deleteAccountConfirm} title="Supprimer aussi le compte personnel ?" message="Contrairement à « Supprimer », ceci supprime définitivement le compte StockMaster de cette personne (plus aucune connexion possible avec cet email, aucune trace). Refusé automatiquement s’il a un paiement réussi à son nom, ou s’il travaille encore activement ailleurs (une autre entreprise). Ses ventes et opérations déjà enregistrées ici restent conservées, sans nom rattaché. Action irréversible." destructive loading={removeAccount.isPending} reason={deleteAccountReason} onReasonChange={setDeleteAccountReason} onCancel={()=>{setDeleteAccountConfirm(false);setDeleteAccountReason('')}} onConfirm={()=>removeAccount.mutate()}/>
  </AdminPage>;
}

const styles = StyleSheet.create({
  hero: { padding: 20, borderRadius: 24, gap: 4 },
  heroValue: { fontWeight: '800' },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '800', fontSize: 14 },
  requestSummary: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  requestBlock: { gap: 6, paddingBottom: 14 },
  requestActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  reviewDialog: { width: '92%', maxWidth: 520, alignSelf: 'center' },
});
