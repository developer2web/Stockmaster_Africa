import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Card,Dialog,HelperText,Icon,Portal,Text,TextInput } from 'react-native-paper';
import { SelectField } from '@/components/forms/SelectField';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { supportedCountries } from '@/constants/countries';
import { finalizeAdminAccess,getMyAdminAccessRequest,requestAdminAccess } from '@/features/account/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { RoleGuard } from '@/features/auth/RoleGuard';

export default function EmployeeSettings() {
  const { session,membership,signOut,refreshMembership }=useAuth();const cache=useQueryClient();const[open,setOpen]=useState(false);const[companyName,setCompanyName]=useState('');const[storeName,setStoreName]=useState('');const[countryCode,setCountryCode]=useState<string|null>('GN');
  const request=useQuery({queryKey:['my-admin-access-request'],queryFn:getMyAdminAccessRequest});
  const submit=useMutation({mutationFn:()=>requestAdminAccess({companyName,storeName,countryCode:countryCode??'GN'}),onSuccess:async()=>{await cache.invalidateQueries({queryKey:['my-admin-access-request']});setOpen(false)}});
  const finalize=useMutation({mutationFn:()=>finalizeAdminAccess(request.data!.id),onSuccess:async()=>{await refreshMembership();router.replace('/')}});
  const status=request.data?.status;
  return <RoleGuard roles={['employee']}><AdminPage title="Paramètres">
    <Card mode="contained"><Card.Title title={session?.user.email??'Compte employé'} subtitle={`${membership?.companyName??''} • ${membership?.storeName??'Boutique'}`} left={()=><Icon source="account-circle-outline" size={30}/>} /></Card>
    <Text variant="titleMedium">Compte et sécurité</Text>
    <Card mode="outlined" onPress={()=>router.push('/employee/security' as never)}><Card.Title title="Mot de passe" subtitle="Vérification de l’ancien mot de passe obligatoire" left={()=><Icon source="shield-lock-outline" size={28}/>} right={()=><Icon source="chevron-right" size={24}/>} /></Card>
    <Card mode="outlined"><Card.Title title="Devenir administrateur" subtitle="Votre email et votre compte resteront identiques" left={()=><Icon source="account-arrow-up-outline" size={28}/>} />
      <Card.Content>{!status&&<Text>Créez une demande. Le Super Admin doit la valider avant la création de votre entreprise.</Text>}{status==='pending'&&<HelperText type="info" visible>Votre demande est en attente de validation par le Super Admin.</HelperText>}{status==='rejected'&&<HelperText type="error" visible>Demande refusée : {request.data?.review_reason??'aucun motif indiqué'}</HelperText>}{status==='approved'&&<HelperText type="info" visible>Demande approuvée. Vous pouvez maintenant créer votre espace administrateur.</HelperText>}{status==='completed'&&<Text>Votre espace administrateur a déjà été créé.</Text>}{!!submit.error&&<HelperText type="error" visible>{submit.error.message}</HelperText>}{!!finalize.error&&<HelperText type="error" visible>{finalize.error.message}</HelperText>}</Card.Content>
      <Card.Actions>{(!status||status==='rejected')&&<AppButton icon="send-check-outline" onPress={()=>setOpen(true)}>Faire la demande</AppButton>}{status==='approved'&&<AppButton icon="office-building-plus-outline" loading={finalize.isPending} onPress={()=>finalize.mutate()}>Créer mon entreprise</AppButton>}</Card.Actions>
    </Card>
    <Card mode="outlined" onPress={()=>router.push('/legal/privacy' as never)}><Card.Title title="Confidentialité" subtitle="Protection et utilisation de vos données" left={()=><Icon source="shield-account-outline" size={28}/>} right={()=><Icon source="chevron-right" size={24}/>} /></Card>
    <Card mode="outlined" onPress={()=>router.push('/legal/terms' as never)}><Card.Title title="Conditions d’utilisation" subtitle="Règles applicables au compte" left={()=><Icon source="file-document-outline" size={28}/>} right={()=><Icon source="chevron-right" size={24}/>} /></Card>
    <AppButton mode="outlined" icon="logout" onPress={signOut}>Se déconnecter</AppButton>
    <Portal><Dialog visible={open} onDismiss={()=>setOpen(false)}><Dialog.Title>Demande d’accès administrateur</Dialog.Title><Dialog.Content style={{gap:10}}><Text>Le Super Admin vérifiera cette demande. Aucun deuxième compte ne sera créé avec votre email.</Text><TextInput mode="outlined" label="Nom de votre entreprise" value={companyName} onChangeText={setCompanyName}/><TextInput mode="outlined" label="Première boutique" value={storeName} onChangeText={setStoreName}/><SelectField label="Pays" value={countryCode} onChange={setCountryCode} options={supportedCountries.map(country=>({label:country.name,value:country.code}))}/>{!!submit.error&&<HelperText type="error" visible>{submit.error.message}</HelperText>}</Dialog.Content><Dialog.Actions><AppButton mode="text" onPress={()=>setOpen(false)}>Annuler</AppButton><AppButton loading={submit.isPending} disabled={submit.isPending||companyName.trim().length<2||storeName.trim().length<2} onPress={()=>submit.mutate()}>Envoyer au Super Admin</AppButton></Dialog.Actions></Dialog></Portal>
  </AdminPage></RoleGuard>;
}
