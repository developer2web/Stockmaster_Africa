import * as Linking from 'expo-linking';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { HelperText } from 'react-native-paper';

import { FormField } from '@/components/forms/FormField';
import { AppButton } from '@/components/ui/AppButton';
import { AppBackButton } from '@/components/ui/AppBackButton';
import { AuthScreen } from '@/features/auth/AuthScreen';
import { recoveryErrorMessage } from '@/features/auth/recoveryError';
import { supabase } from '@/services/supabase/client';

export default function ForgotPassword() {
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const { control, handleSubmit, formState } = useForm<{ email: string }>({
    defaultValues: { email: '' },
  });
  const submit = handleSubmit(async ({ email }) => {
    setMessage('');
    setFailed(false);
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) { setFailed(true); setMessage('Saisissez une adresse email valide.'); return; }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: Linking.createURL('/reset-password'),
      });
      if (error) throw error;
      setMessage('Si ce compte existe, la demande a été acceptée. Consultez votre boîte email et les courriers indésirables.');
    } catch (error) {
      setFailed(true);
      setMessage(recoveryErrorMessage(error));
    }
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
      <HelperText type={failed ? 'error' : 'info'} visible={!!message}>{message}</HelperText>
      <AppButton onPress={submit} loading={formState.isSubmitting} disabled={formState.isSubmitting}>
        Envoyer le lien
      </AppButton>
      {!formState.isSubmitting && <AppBackButton fallback={returnTo === '/employee' ? '/employee' : '/(auth)/login'} />}
    </AuthScreen>
  );
}
