import * as Linking from 'expo-linking';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { HelperText } from 'react-native-paper';

import { FormField } from '@/components/forms/FormField';
import { AppButton } from '@/components/ui/AppButton';
import { AppBackButton } from '@/components/ui/AppBackButton';
import { AuthScreen } from '@/features/auth/AuthScreen';
import { recoveryErrorMessage } from '@/features/auth/recoveryError';
import { supabase } from '@/services/supabase/client';

// Revue sécurité du 25/09 : en plus de la limite côté serveur Supabase (par
// email, indépendante de l'existence du compte), un délai local entre deux
// envois freine les demandes répétées depuis l'app elle-même. Il démarre
// pour TOUTE tentative envoyée (succès ou échec) et jamais pour un simple
// format invalide (aucune requête réseau) : purement basé sur l'horloge
// locale, il ne dépend d'aucun état lié au compte et ne peut donc pas, par
// construction, révéler si l'adresse existe.
const RESEND_COOLDOWN_SECONDS = 30;

export default function ForgotPassword() {
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const { control, handleSubmit, formState } = useForm<{ email: string }>({
    defaultValues: { email: '' },
  });

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const submit = handleSubmit(async ({ email }) => {
    setMessage('');
    setFailed(false);
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) { setFailed(true); setMessage('Saisissez une adresse email valide.'); return; }
    setCooldown(RESEND_COOLDOWN_SECONDS);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: Linking.createURL('/reset-password'),
      });
      if (error) throw error;
      setMessage('Si un compte est associé à cette adresse, vous recevrez un lien de réinitialisation. Vérifiez votre boîte de réception et vos courriers indésirables.');
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
        autoComplete="username"
        textContentType="username"
      />
      <HelperText type={failed ? 'error' : 'info'} visible={!!message}>{message}</HelperText>
      <AppButton onPress={submit} loading={formState.isSubmitting} disabled={formState.isSubmitting || cooldown > 0}>
        {cooldown > 0 ? `Réessayer dans ${cooldown}s` : 'Envoyer le lien'}
      </AppButton>
      {!formState.isSubmitting && <AppBackButton fallback={returnTo === '/employee' ? '/employee' : '/(auth)/login'} />}
    </AuthScreen>
  );
}
