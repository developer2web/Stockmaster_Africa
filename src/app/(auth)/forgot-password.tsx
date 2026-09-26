import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { HelperText } from 'react-native-paper';

import { FormField } from '@/components/forms/FormField';
import { AppButton } from '@/components/ui/AppButton';
import { AppBackButton } from '@/components/ui/AppBackButton';
import { AuthScreen } from '@/features/auth/AuthScreen';
import { recoveryErrorMessage } from '@/features/auth/recoveryError';
import { authEmailExists } from '@/features/account/api';
import { supabase } from '@/services/supabase/client';

// Revue sécurité du 25/09 : en plus de la limite côté serveur Supabase, un délai
// local entre deux envois freine les demandes répétées depuis l'app elle-même. Il
// démarre pour toute tentative envoyée et jamais pour un simple format invalide.
//
// Décision explicite du propriétaire (26/09) : l'écran indique maintenant si
// l'adresse n'a pas de compte (auth_email_exists) et propose d'en créer un, au lieu
// du message générique. Compromis accepté : un tiers peut tester si une adresse est
// inscrite. Aucun email n'est envoyé pour une adresse inconnue.
const RESEND_COOLDOWN_SECONDS = 30;

export default function ForgotPassword() {
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [unknownEmail, setUnknownEmail] = useState(false);
  const employeePortal = returnTo === '/employee';
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
    setUnknownEmail(false);
    try {
      if (!(await authEmailExists(normalizedEmail))) {
        setFailed(true);
        setUnknownEmail(true);
        // Un employé ne crée pas son compte lui-même : c'est son administrateur qui l'invite.
        setMessage(employeePortal
          ? 'Aucun compte n’est associé à cette adresse. Vérifiez l’email saisi ou demandez à votre administrateur de vous créer un accès.'
          : 'Aucun compte n’est associé à cette adresse. Vérifiez l’email saisi ou créez un compte.');
        return;
      }
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: Linking.createURL('/reset-password'),
      });
      if (error) throw error;
      setMessage('Un lien de réinitialisation a été envoyé à cette adresse. Vérifiez votre boîte de réception et vos courriers indésirables.');
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
      {unknownEmail && !employeePortal && <AppButton mode="outlined" icon="account-plus-outline" onPress={() => router.push('/(auth)/register')}>Créer un compte</AppButton>}
      {!formState.isSubmitting && <AppBackButton fallback={employeePortal ? '/employee' : '/(auth)/login'} />}
    </AuthScreen>
  );
}
