import * as Linking from 'expo-linking';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { HelperText } from 'react-native-paper';

import { FormField } from '@/components/forms/FormField';
import { AppButton } from '@/components/ui/AppButton';
import { AppBackButton } from '@/components/ui/AppBackButton';
import { AuthScreen } from '@/features/auth/AuthScreen';
import { supabase } from '@/services/supabase/client';

export default function ForgotPassword() {
  const [message, setMessage] = useState('');
  const { control, handleSubmit, formState } = useForm<{ email: string }>({
    defaultValues: { email: '' },
  });
  const submit = handleSubmit(async ({ email }) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: Linking.createURL('/reset-password'),
    });
    setMessage(error?.message ?? 'Consultez votre boîte email pour continuer.');
  });

  return (
    <AuthScreen title="Mot de passe oublié" subtitle="Nous vous envoyons un lien sécurisé.">
      <FormField
        control={control}
        name="email"
        label="Email"
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <HelperText type="info" visible={!!message}>{message}</HelperText>
      <AppButton onPress={submit} loading={formState.isSubmitting}>
        Envoyer le lien
      </AppButton>
      {!formState.isSubmitting && <AppBackButton fallback="/(auth)/login" />}
    </AuthScreen>
  );
}
