import { router } from 'expo-router';
import { Card,Icon,Text } from 'react-native-paper';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { AccountDeletionCard } from '@/components/legal/AccountDeletionCard';
import { OfflineAccessCard } from '@/components/security/OfflineAccessCard';
import { useAuth } from '@/features/auth/AuthProvider';
import { RoleGuard } from '@/features/auth/RoleGuard';

export default function EmployeeSettings() {
  const { session,membership,signOut }=useAuth();
  return <RoleGuard roles={['employee']}><AdminPage title="Paramètres">
    <Card mode="contained"><Card.Title title={session?.user.email??'Compte employé'} subtitle={`${membership?.companyName??''} • ${membership?.storeName??'Boutique'}`} left={()=><Icon source="account-circle-outline" size={30}/>} /></Card>
    <Text variant="titleMedium">Compte et sécurité</Text>
    <OfflineAccessCard />
    <Card mode="outlined" onPress={()=>router.push('/employee/security' as never)}><Card.Title title="Mot de passe" subtitle="Vérification de l’ancien mot de passe obligatoire" left={()=><Icon source="shield-lock-outline" size={28}/>} right={()=><Icon source="chevron-right" size={24}/>} /></Card>
    <Card mode="outlined" onPress={()=>router.push('/legal/privacy' as never)}><Card.Title title="Confidentialité" subtitle="Protection et utilisation de vos données" left={()=><Icon source="shield-account-outline" size={28}/>} right={()=><Icon source="chevron-right" size={24}/>} /></Card>
    <Card mode="outlined" onPress={()=>router.push('/legal/terms' as never)}><Card.Title title="Conditions d’utilisation" subtitle="Règles applicables au compte" left={()=><Icon source="file-document-outline" size={28}/>} right={()=><Icon source="chevron-right" size={24}/>} /></Card>
    <Text variant="titleMedium" style={{color:'#C92A2A'}}>Zone sensible</Text>
    <AccountDeletionCard />
    <AppButton mode="outlined" icon="logout" onPress={signOut}>Se déconnecter</AppButton>
  </AdminPage></RoleGuard>;
}
