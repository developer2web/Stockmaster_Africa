import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, HelperText, Icon, Text } from 'react-native-paper';

import { FormField } from '@/components/forms/FormField';
import { AppButton } from '@/components/ui/AppButton';
import { replaceTemporaryPassword } from '@/features/account/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { useForm } from 'react-hook-form';

type PasswordForm = { password: string; confirmation: string };

export default function ChangeTemporaryPasswordScreen() {
  const { session } = useAuth();
  const [error, setError] = useState('');
  const { control, handleSubmit, formState } = useForm<PasswordForm>({
    defaultValues: { password: '', confirmation: '' },
  });

  if (!session) return <Redirect href="/(auth)/login" />;
  if (session.user.user_metadata?.must_change_password !== true) return <Redirect href="/" />;

  const submit = handleSubmit(async ({ password, confirmation }) => {
    setError('');
    if (password.length < 10 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      setError('Utilisez au moins 10 caractères avec majuscule, minuscule, chiffre et caractère spécial.');
      return;
    }
    if (password !== confirmation) {
      setError('Les mots de passe sont différents.');
      return;
    }
    try {
      await replaceTemporaryPassword(password);
      router.replace('/');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Modification impossible.');
    }
  });

  return <View style={styles.page}>
    <Card mode="elevated" style={styles.card}>
      <Card.Content style={styles.content}>
        <View style={styles.heading}>
          <Icon source="lock-reset" size={36} />
          <View style={styles.copy}>
            <Text variant="headlineSmall" style={styles.bold}>Créez votre mot de passe</Text>
            <Text>Le mot de passe transmis par votre administrateur était provisoire.</Text>
          </View>
        </View>
        <FormField control={control} name="password" label="Nouveau mot de passe" passwordToggle autoComplete="new-password" autoFocus />
        <FormField control={control} name="confirmation" label="Confirmer le mot de passe" passwordToggle autoComplete="new-password" />
        <HelperText type="info" visible>10 caractères minimum, avec majuscule, minuscule, chiffre et caractère spécial.</HelperText>
        {!!error && <HelperText type="error" visible>{error}</HelperText>}
        <AppButton loading={formState.isSubmitting} disabled={formState.isSubmitting} onPress={submit}>Enregistrer et continuer</AppButton>
      </Card.Content>
    </Card>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 520 },
  content: { gap: 10, paddingVertical: 20 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 8 },
  copy: { flex: 1, gap: 4 },
  bold: { fontWeight: '800' },
});
