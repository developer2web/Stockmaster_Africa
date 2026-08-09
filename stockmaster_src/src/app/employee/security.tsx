import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, HelperText, Icon, Text, useTheme } from 'react-native-paper';
import { useForm } from 'react-hook-form';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { FormField } from '@/components/forms/FormField';
import { useAuth } from '@/features/auth/AuthProvider';
import { RoleGuard } from '@/features/auth/RoleGuard';
import { supabase } from '@/services/supabase/client';

export default function EmployeeSecurity() {
  const { session } = useAuth();
  const theme = useTheme();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { control, handleSubmit, formState, reset } = useForm<{ password: string; confirm: string }>({ defaultValues: { password: '', confirm: '' } });
  if (!session) return null;

  const submit = handleSubmit(async (values) => {
    setError('');
    setMessage('');
    if (values.password.length < 8) return setError('Le mot de passe doit contenir au moins 8 caractères.');
    if (values.password !== values.confirm) return setError('Les mots de passe sont différents.');
    const { error: updateError } = await supabase.auth.updateUser({ password: values.password });
    if (updateError) setError(updateError.message);
    else {
      setMessage('Votre mot de passe a été mis à jour.');
      reset();
    }
  });

  return (
    <RoleGuard roles={['employee']}>
      <AdminPage title="Sécurité">
        <Card mode="contained" style={{ backgroundColor: theme.colors.primaryContainer }}>
          <Card.Content style={styles.intro}>
            <View style={[styles.icon, { backgroundColor: theme.colors.primary }]}>
              <Icon source="shield-check-outline" size={30} color={theme.colors.onPrimary} />
            </View>
            <View style={styles.copy}>
              <Text variant="titleLarge" style={styles.bold}>Protégez votre compte</Text>
              <Text style={{ color: theme.colors.onPrimaryContainer }}>Choisissez un mot de passe unique d’au moins 8 caractères.</Text>
            </View>
          </Card.Content>
        </Card>
        <Card mode="contained" style={{ backgroundColor: theme.colors.surface }}>
          <Card.Content style={styles.form}>
            <FormField control={control} name="password" label="Nouveau mot de passe" passwordToggle autoComplete="new-password" />
            <FormField control={control} name="confirm" label="Confirmer le mot de passe" passwordToggle autoComplete="new-password" />
            {!!error && <HelperText type="error" visible>{error}</HelperText>}
            {!!message && <HelperText type="info" visible>{message}</HelperText>}
            <AppButton icon="lock-reset" loading={formState.isSubmitting} disabled={formState.isSubmitting} onPress={submit}>Mettre à jour</AppButton>
          </Card.Content>
        </Card>
      </AdminPage>
    </RoleGuard>
  );
}

const styles = StyleSheet.create({
  intro: { flexDirection: 'row', alignItems: 'center', gap: 15, paddingVertical: 8 },
  icon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 4 },
  bold: { fontWeight: '800' },
  form: { gap: 4, paddingVertical: 12 },
});
