import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Card, Dialog, HelperText, Icon, Portal, Text, TextInput } from 'react-native-paper';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { changePasswordWithVerification, requestAccountDeletion } from '@/features/account/api';
import { useAuth } from '@/features/auth/AuthProvider';

export default function SettingsScreen() {
  const { session, membership, signOut } = useAuth();
  const admin = membership?.role === 'company_admin';
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordValidation, setPasswordValidation] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [deletionOpen, setDeletionOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');

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
  const deletion = useMutation({ mutationFn: () => requestAccountDeletion(reason), onSuccess: () => { setDeletionOpen(false); setConfirmation(''); } });

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
    <Card mode="contained"><Card.Title title={membership?.companyName || 'StockMaster'} subtitle={`${session?.user.email ?? 'Compte'} • ${membership?.roleName ?? ''}`} left={() => <Icon source="account-cog-outline" size={30} />} /></Card>

    {admin && <>
      <Text variant="titleMedium">Entreprise</Text>
      <Card mode="outlined" onPress={() => router.push('/company' as never)}><Card.Title title="Informations et règles de vente" subtitle="Coordonnées, devise, taxes, reçus, remises et crédit" left={() => <Icon source="office-building-cog-outline" size={28} />} right={() => <Icon source="chevron-right" size={24} />} /></Card>
      <Card mode="outlined" onPress={() => router.push('/stores' as never)}><Card.Title title="Boutiques" subtitle="Adresses et organisation des points de vente" left={() => <Icon source="store-cog-outline" size={28} />} right={() => <Icon source="chevron-right" size={24} />} /></Card>
      <Card mode="outlined" onPress={() => router.push('/employees' as never)}><Card.Title title="Employés et permissions" subtitle="Comptes, rôles et accès aux boutiques" left={() => <Icon source="account-key-outline" size={28} />} right={() => <Icon source="chevron-right" size={24} />} /></Card>
      <Card mode="outlined" onPress={() => router.push('/(subscription)' as never)}><Card.Title title="Abonnement" subtitle="Forfait, renouvellement et historique" left={() => <Icon source="credit-card-cog-outline" size={28} />} right={() => <Icon source="chevron-right" size={24} />} /></Card>
    </>}

    <Text variant="titleMedium">Compte et sécurité</Text>
    <Card mode="outlined">
      <Card.Title title="Mot de passe" subtitle="L’ancien mot de passe sera vérifié" left={() => <Icon source="shield-lock-outline" size={28} />} />
      <Card.Actions><AppButton mode="text" icon="lock-reset" onPress={() => { passwordMutation.reset(); setPasswordValidation(''); setPasswordOpen(true); }}>Modifier en sécurité</AppButton></Card.Actions>
    </Card>
    {passwordSuccess && <HelperText type="info" visible>Votre mot de passe a été modifié.</HelperText>}
    <Card mode="outlined" onPress={() => router.push('/legal/privacy' as never)}><Card.Title title="Politique de confidentialité" subtitle="Utilisation et protection de vos données" left={() => <Icon source="shield-account-outline" size={28} />} right={() => <Icon source="chevron-right" size={24} />} /></Card>
    <Card mode="outlined" onPress={() => router.push('/legal/terms' as never)}><Card.Title title="Conditions d’utilisation" subtitle="Règles du service et abonnements" left={() => <Icon source="file-document-outline" size={28} />} right={() => <Icon source="chevron-right" size={24} />} /></Card>
    <AppButton mode="outlined" icon="logout" onPress={signOut}>Se déconnecter</AppButton>

    {admin && <>
      <Text variant="titleMedium" style={{ color: '#C92A2A' }}>Zone sensible</Text>
      <Card mode="outlined">
        <Card.Title title="Suppression du compte" subtitle="Demande examinée avant fermeture définitive" left={() => <Icon source="account-remove-outline" size={28} color="#C92A2A" />} />
        <Card.Content><Text>Les écritures financières légalement nécessaires peuvent être conservées avec un accès restreint.</Text></Card.Content>
        <Card.Actions><AppButton mode="text" textColor="#C92A2A" onPress={() => setDeletionOpen(true)}>Demander la suppression</AppButton></Card.Actions>
      </Card>
    </>}
    {deletion.isSuccess && <HelperText type="info" visible>Votre demande de suppression a été enregistrée.</HelperText>}

    <Portal>
      <Dialog visible={passwordOpen} onDismiss={() => !passwordMutation.isPending && setPasswordOpen(false)}>
        <Dialog.Title>Modifier le mot de passe</Dialog.Title>
        <Dialog.Content style={{ gap: 10 }}>
          <TextInput mode="outlined" label="Mot de passe actuel" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry autoComplete="current-password" />
          <TextInput mode="outlined" label="Nouveau mot de passe" value={newPassword} onChangeText={setNewPassword} secureTextEntry autoComplete="new-password" />
          <TextInput mode="outlined" label="Confirmer le nouveau mot de passe" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry autoComplete="new-password" />
          <HelperText type="info" visible>10 caractères minimum avec majuscule, minuscule, chiffre et caractère spécial.</HelperText>
          {!!passwordValidation && <HelperText type="error" visible>{passwordValidation}</HelperText>}
          {!!passwordMutation.error && <HelperText type="error" visible>{passwordMutation.error.message}</HelperText>}
        </Dialog.Content>
        <Dialog.Actions><AppButton mode="text" disabled={passwordMutation.isPending} onPress={() => setPasswordOpen(false)}>Annuler</AppButton><AppButton icon="shield-check" loading={passwordMutation.isPending} disabled={passwordMutation.isPending} onPress={submitPassword}>Confirmer</AppButton></Dialog.Actions>
      </Dialog>

      <Dialog visible={deletionOpen} onDismiss={() => !deletion.isPending && setDeletionOpen(false)}>
        <Dialog.Title>Demande de suppression</Dialog.Title>
        <Dialog.Content style={{ gap: 10 }}>
          <Text>Pour éviter une action accidentelle, écrivez SUPPRIMER ci-dessous.</Text>
          <TextInput mode="outlined" label="Raison (facultatif)" value={reason} onChangeText={setReason} multiline />
          <TextInput mode="outlined" label="Confirmation" value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" />
          {!!deletion.error && <HelperText type="error" visible>{deletion.error.message}</HelperText>}
        </Dialog.Content>
        <Dialog.Actions><AppButton mode="text" disabled={deletion.isPending} onPress={() => setDeletionOpen(false)}>Annuler</AppButton><AppButton buttonColor="#C92A2A" loading={deletion.isPending} disabled={deletion.isPending || confirmation.trim().toUpperCase() !== 'SUPPRIMER'} onPress={() => deletion.mutate()}>Confirmer la demande</AppButton></Dialog.Actions>
      </Dialog>
    </Portal>
  </AdminPage>;
}
