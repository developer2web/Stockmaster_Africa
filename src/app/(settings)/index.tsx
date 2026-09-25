import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Dialog, HelperText, Portal, Text, useTheme } from 'react-native-paper';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { ListRow, ListSection } from '@/components/ui/ListSection';
import { AccountDeletionCard } from '@/components/legal/AccountDeletionCard';
import { ValidatedInput } from '@/components/forms/ValidatedInput';
import { changePasswordSchema } from '@/schemas/auth';
import { OfflineAccessCard } from '@/components/security/OfflineAccessCard';
import { changePasswordWithVerification } from '@/features/account/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { useSignOutAction } from '@/features/auth/useSignOutAction';
import { openAccountPortal } from '@/features/subscriptions/accountPortal';
import { companyInitials } from '@/utils/initials';

// Nouvelle structure (retour testeur du 24/09, captures Uber Driver) : liste
// continue divisée par section. « Employés et permissions » a été retiré
// d'ici — cet outil ne vit plus que dans Menu (Équipe), pour éviter le
// doublon entre les deux écrans.
export default function SettingsScreen() {
  const theme = useTheme();
  const { session, membership } = useAuth();
  const { signOut, signingOut } = useSignOutAction();
  const admin = membership?.role === 'company_admin';
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordValidation, setPasswordValidation] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [accountError, setAccountError] = useState('');

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

  // Le bouton « Confirmer » reste désactivé tant que le formulaire n'est pas valide.
  const passwordCheck = changePasswordSchema.safeParse({ currentPassword, password: newPassword, confirm: confirmPassword });
  const passwordIssues = passwordCheck.success ? [] : passwordCheck.error.issues;
  const issueFor = (field: string, value: string) => value === '' ? undefined : passwordIssues.find((issue) => issue.path[0] === field)?.message;
  const submitPassword = () => {
    setPasswordValidation('');
    passwordMutation.reset();
    if (!passwordCheck.success) return setPasswordValidation(passwordCheck.error.issues[0].message);
    passwordMutation.mutate();
  };
  const openPasswordDialog = () => { passwordMutation.reset(); setPasswordValidation(''); setPasswordSuccess(false); setPasswordOpen(true); };

  return <AdminPage title="Paramètres">
    <View style={styles.accountRow}>
      <View style={[styles.avatar, { backgroundColor: theme.colors.primaryContainer }]}>
        <Text style={[styles.avatarText, { color: theme.colors.primary }]}>{companyInitials(membership?.companyName)}</Text>
      </View>
      <View style={styles.grow}>
        <Text variant="titleSmall" style={styles.bold} numberOfLines={1}>{membership?.companyName || 'StockMaster'}</Text>
        <Text variant="bodySmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>{membership?.roleName || 'Utilisateur'} · {session?.user.email ?? 'Compte'}</Text>
      </View>
    </View>

    {admin && <ListSection title="Entreprise">
      <ListRow icon="office-building-cog-outline" title="Informations et règles de vente" subtitle="Coordonnées, devise, taxes, reçus, remises et crédit" onPress={() => router.push('/company' as never)} />
      <ListRow icon="store-cog-outline" title="Boutiques" subtitle="Adresses et organisation des points de vente" onPress={() => router.push('/stores' as never)} />
      <ListRow icon="credit-card-cog-outline" title="Abonnement" subtitle="Forfait, renouvellement et historique sur Account" last onPress={() => { setAccountError(''); void openAccountPortal(membership?.companyId ?? '').catch((error) => setAccountError(error.message)); }} />
    </ListSection>}
    {!!accountError && <HelperText type="error" visible>{accountError}</HelperText>}

    {/* « Sécurité et 2FA » retiré d'ici (retour testeur du 25/09) : déjà accessible
        depuis le raccourci Sécurité du Menu, pas la peine de le répéter ici. */}
    <ListSection title="Compte et sécurité">
      <ListRow icon="history" title="Journal des connexions" subtitle="Historique récent des accès au compte" onPress={() => router.push('/(settings)/security-history' as never)} />
      <ListRow icon="cloud-sync-outline" title="Synchronisation hors ligne" subtitle="Opérations en attente et conflits de stock" onPress={() => router.push('/(settings)/offline' as never)} />
      <ListRow icon="shield-lock-outline" title="Mot de passe" subtitle="Vérification de l’ancien mot de passe obligatoire" last onPress={openPasswordDialog} />
    </ListSection>
    <OfflineAccessCard />
    {passwordSuccess && <HelperText type="info" visible>Votre mot de passe a été modifié.</HelperText>}

    <ListSection title="Général">
      <ListRow icon="shield-account-outline" title="Politique de confidentialité" subtitle="Utilisation et protection de vos données" onPress={() => router.push('/legal/privacy' as never)} />
      <ListRow icon="file-document-outline" title="Conditions d’utilisation" subtitle="Règles du service et abonnements" last onPress={() => router.push('/legal/terms' as never)} />
    </ListSection>

    <AppButton mode="outlined" icon="logout" loading={signingOut} disabled={signingOut} onPress={signOut}>Se déconnecter</AppButton>

    {admin && <>
      <Text variant="titleMedium" style={{ color: theme.colors.error }}>Zone sensible</Text>
      <AccountDeletionCard />
    </>}

    <Portal>
      <Dialog style={styles.dialog} visible={passwordOpen} onDismiss={() => !passwordMutation.isPending && setPasswordOpen(false)}>
        <Dialog.Title>Modifier le mot de passe</Dialog.Title>
        <Dialog.Content style={{ gap: 10 }}>
          <ValidatedInput label="Mot de passe actuel" required errorText={issueFor('currentPassword', currentPassword)} value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry autoComplete="current-password" textContentType="password" />
          <ValidatedInput label="Nouveau mot de passe" required errorText={issueFor('password', newPassword)} value={newPassword} onChangeText={setNewPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
          <ValidatedInput label="Confirmer le nouveau mot de passe" required errorText={issueFor('confirm', confirmPassword)} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
          <HelperText type="info" visible>Majuscule, minuscule, chiffre et caractère spécial.</HelperText>
          {!!passwordValidation && <HelperText type="error" visible>{passwordValidation}</HelperText>}
          {!!passwordMutation.error && <HelperText type="error" visible>{passwordMutation.error.message}</HelperText>}
        </Dialog.Content>
        <Dialog.Actions style={{ flexWrap: 'wrap' }}><AppButton mode="text" disabled={passwordMutation.isPending} onPress={() => setPasswordOpen(false)}>Annuler</AppButton><AppButton icon="shield-check" loading={passwordMutation.isPending} disabled={passwordMutation.isPending || !passwordCheck.success} onPress={submitPassword}>Confirmer</AppButton></Dialog.Actions>
      </Dialog>
    </Portal>
  </AdminPage>;
}

const styles = StyleSheet.create({
  bold: { fontWeight: '800' },
  grow: { flex: 1, minWidth: 0 },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '800' },
  dialog: { width: '92%', maxWidth: 520, alignSelf: 'center' },
});
