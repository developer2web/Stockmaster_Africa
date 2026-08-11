import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, HelperText, Icon, Text, useTheme } from 'react-native-paper';
import { useForm } from 'react-hook-form';
import { router } from 'expo-router';
import { FormField } from '@/components/forms/FormField';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { changePasswordWithVerification } from '@/features/account/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { RoleGuard } from '@/features/auth/RoleGuard';

type PasswordForm = { currentPassword: string; password: string; confirm: string };

export default function EmployeeSecurity() {
  const { session } = useAuth();
  const theme = useTheme();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { control, handleSubmit, formState, reset } = useForm<PasswordForm>({ defaultValues: { currentPassword: '', password: '', confirm: '' } });
  if (!session) return null;

  const submit = handleSubmit(async (values) => {
    setError('');
    setMessage('');
    if (values.currentPassword.length < 8) return setError('Saisissez votre mot de passe actuel.');
    if (values.password === values.currentPassword) return setError('Le nouveau mot de passe doit être différent de l’ancien.');
    if (values.password.length < 10 || !/[A-Z]/.test(values.password) || !/[a-z]/.test(values.password) || !/[0-9]/.test(values.password) || !/[^A-Za-z0-9]/.test(values.password)) return setError('Utilisez au moins 10 caractères avec majuscule, minuscule, chiffre et caractère spécial.');
    if (values.password !== values.confirm) return setError('Les nouveaux mots de passe sont différents.');
    try {
      await changePasswordWithVerification(values.currentPassword, values.password);
      setMessage('Votre mot de passe a été mis à jour en toute sécurité.');
      reset();
      router.replace('/employee/settings' as never);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Modification impossible.');
    }
  });

  return <RoleGuard roles={['employee']}><AdminPage title="Mot de passe">
    <Card mode="contained" style={{ backgroundColor: theme.colors.primaryContainer }}><Card.Content style={styles.intro}>
      <View style={[styles.icon, { backgroundColor: theme.colors.primary }]}><Icon source="shield-lock-outline" size={30} color={theme.colors.onPrimary} /></View>
      <View style={styles.copy}><Text variant="titleLarge" style={styles.bold}>Action protégée</Text><Text style={{ color: theme.colors.onPrimaryContainer }}>Votre mot de passe actuel est obligatoire avant toute modification.</Text></View>
    </Card.Content></Card>
    <Card mode="outlined"><Card.Content style={styles.form}>
      <FormField control={control} name="currentPassword" label="Mot de passe actuel" passwordToggle autoComplete="current-password" />
      <FormField control={control} name="password" label="Nouveau mot de passe" passwordToggle autoComplete="new-password" />
      <FormField control={control} name="confirm" label="Confirmer le nouveau mot de passe" passwordToggle autoComplete="new-password" />
      <HelperText type="info" visible>10 caractères minimum, avec majuscule, minuscule, chiffre et caractère spécial.</HelperText>
      {!!error && <HelperText type="error" visible>{error}</HelperText>}
      {!!message && <HelperText type="info" visible>{message}</HelperText>}
      <AppButton icon="lock-reset" loading={formState.isSubmitting} disabled={formState.isSubmitting} onPress={submit}>Changer mon mot de passe</AppButton>
    </Card.Content></Card>
  </AdminPage></RoleGuard>;
}

const styles = StyleSheet.create({
  intro: { flexDirection: 'row', alignItems: 'center', gap: 15, paddingVertical: 8 },
  icon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 4 },
  bold: { fontWeight: '800' },
  form: { gap: 8, paddingVertical: 12 },
});
