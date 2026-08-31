import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Card, Dialog, HelperText, Icon, Portal, Text, TextInput, useTheme } from 'react-native-paper';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { AccountDeletionCard } from '@/components/legal/AccountDeletionCard';
import { changePasswordWithVerification } from '@/features/account/api';
import { useAuth } from '@/features/auth/AuthProvider';

export default function SettingsScreen() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const compact = width < 600;
  const { session, membership, signOut } = useAuth();
  const admin = membership?.role === 'company_admin';
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordValidation, setPasswordValidation] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const passwordMutation = useMutation({
    mutationFn: () => changePasswordWithVerification(currentPassword, newPassword),
    onSuccess: () => {
      setPasswordOpen(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess(true);
    },
  });

  const submitPassword = () => {
    setPasswordValidation('');
    passwordMutation.reset();
    if (currentPassword.length < 8) return setPasswordValidation('Saisissez votre mot de passe actuel.');
    if (newPassword === currentPassword) return setPasswordValidation('Le nouveau mot de passe doit être différent de l’ancien.');
    if (newPassword.length < 10 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) return setPasswordValidation('Utilisez 10 caractères minimum avec majuscule, minuscule, chiffre et caractère spécial.');
    if (newPassword !== confirmPassword) return setPasswordValidation('Les nouveaux mots de passe sont différents.');
    passwordMutation.mutate();
  };

  return <AdminPage title="Paramètres">
    <Card mode="contained"><Card.Content style={styles.accountRow}><View style={[styles.accountIcon,{backgroundColor:theme.colors.primaryContainer}]}><Icon source="account-cog-outline" size={28} color={theme.colors.primary}/></View><View style={styles.copy}><Text variant="titleMedium" style={styles.bold}>{membership?.companyName || 'StockMaster'}</Text><Text style={{color:theme.colors.onSurfaceVariant}}>{session?.user.email ?? 'Compte'}</Text><Text variant="labelMedium" style={{color:theme.colors.primary}}>{membership?.roleName || 'Utilisateur'}</Text></View></Card.Content></Card>

    {admin && <>
      <Text variant="titleMedium">Entreprise</Text>
      <SettingsLink title="Informations et règles de vente" subtitle="Coordonnées, devise, taxes, reçus, remises et crédit" icon="office-building-cog-outline" onPress={() => router.push('/company' as never)}/>
      <SettingsLink title="Boutiques" subtitle="Adresses et organisation des points de vente" icon="store-cog-outline" onPress={() => router.push('/stores' as never)}/>
      <SettingsLink title="Employés et permissions" subtitle="Comptes, rôles et accès aux boutiques" icon="account-key-outline" onPress={() => router.push('/employees' as never)}/>
      <SettingsLink title="Abonnement" subtitle="Forfait, renouvellement et historique" icon="credit-card-cog-outline" onPress={() => router.push('/(subscription)' as never)}/>
    </>}

    <Text variant="titleMedium">Compte et sécurité</Text>
    <SettingsLink title="Sécurité et 2FA" subtitle="Double authentification, codes QR et sessions actives" icon="shield-key-outline" onPress={() => router.push('/(settings)/security' as never)}/>
    <SettingsLink title="Journal des connexions" subtitle="Historique récent des accès au compte" icon="history" onPress={() => router.push('/(settings)/security-history' as never)}/>
    <SettingsLink title="Synchronisation hors ligne" subtitle="Opérations en attente et conflits de stock" icon="cloud-sync-outline" onPress={() => router.push('/(settings)/offline' as never)}/>
    <Card mode="outlined">
      <Card.Content style={styles.settingRow}><View style={styles.settingIcon}><Icon source="shield-lock-outline" size={25} color={theme.colors.primary}/></View><View style={styles.copy}><Text variant="titleMedium" style={styles.bold}>Mot de passe et sécurité</Text><Text style={{color:theme.colors.onSurfaceVariant}}>Vérification de l’ancien mot de passe et protection du compte</Text></View></Card.Content>
      <Card.Actions style={[styles.actions,compact&&styles.actionsCompact]}>
        <AppButton style={compact&&styles.mobileButton} mode="contained" icon="lock-reset" onPress={() => { passwordMutation.reset(); setPasswordValidation(''); setPasswordOpen(true); }}>Changer le mot de passe</AppButton>
        <AppButton style={compact&&styles.mobileButton} mode="text" icon="shield-check" onPress={() => router.push('/(settings)/security' as never)}>Gérer la 2FA</AppButton>
      </Card.Actions>
    </Card>
    {passwordSuccess && <HelperText type="info" visible>Votre mot de passe a été modifié.</HelperText>}
    <SettingsLink title="Politique de confidentialité" subtitle="Utilisation et protection de vos données" icon="shield-account-outline" onPress={() => router.push('/legal/privacy' as never)}/>
    <SettingsLink title="Conditions d’utilisation" subtitle="Règles du service et abonnements" icon="file-document-outline" onPress={() => router.push('/legal/terms' as never)}/>
    <AppButton style={compact&&styles.mobileButton} mode="outlined" icon="logout" onPress={signOut}>Se déconnecter</AppButton>

    {admin && <>
      <Text variant="titleMedium" style={{ color: '#C92A2A' }}>Zone sensible</Text>
      <AccountDeletionCard />
    </>}

    <Portal>
      <Dialog style={styles.dialog} visible={passwordOpen} onDismiss={() => !passwordMutation.isPending && setPasswordOpen(false)}>
        <Dialog.Title>Modifier le mot de passe</Dialog.Title>
        <Dialog.Content style={{ gap: 10 }}>
          <TextInput mode="outlined" label="Mot de passe actuel" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry autoComplete="current-password" />
          <TextInput mode="outlined" label="Nouveau mot de passe" value={newPassword} onChangeText={setNewPassword} secureTextEntry autoComplete="new-password" />
          <TextInput mode="outlined" label="Confirmer le nouveau mot de passe" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry autoComplete="new-password" />
          <HelperText type="info" visible>10 caractères minimum avec majuscule, minuscule, chiffre et caractère spécial.</HelperText>
          {!!passwordValidation && <HelperText type="error" visible>{passwordValidation}</HelperText>}
          {!!passwordMutation.error && <HelperText type="error" visible>{passwordMutation.error.message}</HelperText>}
        </Dialog.Content>
        <Dialog.Actions style={{ flexWrap: 'wrap' }}><AppButton mode="text" disabled={passwordMutation.isPending} onPress={() => setPasswordOpen(false)}>Annuler</AppButton><AppButton icon="shield-check" loading={passwordMutation.isPending} disabled={passwordMutation.isPending} onPress={submitPassword}>Confirmer</AppButton></Dialog.Actions>
      </Dialog>

    </Portal>
  </AdminPage>;
}

function SettingsLink({title,subtitle,icon,onPress}:{title:string;subtitle:string;icon:string;onPress:()=>void}){
  const theme=useTheme();
  return <Card mode="outlined" onPress={onPress}><Card.Content style={styles.settingRow}><View style={[styles.settingIcon,{backgroundColor:theme.colors.surfaceVariant}]}><Icon source={icon} size={25} color={theme.colors.primary}/></View><View style={styles.copy}><Text variant="titleMedium" style={styles.bold}>{title}</Text><Text style={{color:theme.colors.onSurfaceVariant}}>{subtitle}</Text></View><Icon source="chevron-right" size={22} color={theme.colors.onSurfaceVariant}/></Card.Content></Card>;
}

const styles=StyleSheet.create({
  accountRow:{flexDirection:'row',alignItems:'center',gap:12},accountIcon:{width:48,height:48,borderRadius:16,alignItems:'center',justifyContent:'center'},
  settingRow:{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:14},settingIcon:{width:44,height:44,borderRadius:14,alignItems:'center',justifyContent:'center'},copy:{flex:1,minWidth:0,gap:2},bold:{fontWeight:'800'},
  actions:{flexWrap:'wrap',gap:8,paddingHorizontal:12,paddingBottom:12},actionsCompact:{flexDirection:'column',alignItems:'stretch'},mobileButton:{width:'100%'},dialog:{width:'92%',maxWidth:520,alignSelf:'center'},
});
