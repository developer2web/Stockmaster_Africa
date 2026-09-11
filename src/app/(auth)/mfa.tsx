import { usePortalLoginState } from '@/features/auth/portalLoginState';
import { useAuth } from '@/features/auth/AuthProvider';
import { validateCurrentPortal, type LoginPortal } from '@/features/auth/portalLogin';
import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { HelperText, TextInput } from 'react-native-paper';

import { AppButton } from '@/components/ui/AppButton';
import { AuthScreen } from '@/features/auth/AuthScreen';
import { supabase } from '@/services/supabase/client';

export default function MfaChallenge() {
  const { portal } = useLocalSearchParams<{ portal?: LoginPortal }>();
  const { refreshMembership, signOut } = useAuth();
  const [code, setCode] = useState('');
  const [factorId, setFactorId] = useState('');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.replace('/(auth)/login');
        return;
      }
      const { data: factors, error } = await supabase.auth.mfa.listFactors();
      if (error) {
        setLoadError('Impossible de vérifier la double authentification. Reconnectez-vous.');
        return;
      }
      const verified = factors.totp.find((factor) => factor.status === 'verified');
      if (!verified) {
        setLoadError('Aucun code d’application d’authentification disponible. Reconnectez-vous ou contactez l’assistance.');
        return;
      }
      setFactorId(verified.id);
    }).catch(() => setLoadError('Vérification indisponible. Reconnectez-vous puis réessayez.'));
  }, []);

  const verify = useMutation({
    mutationFn: async () => {
      const loginState = usePortalLoginState.getState();
      loginState.setPending(true);
      try {
        if (!factorId) throw new Error('Aucun facteur 2FA vérifié.');
        const { data, error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
        if (error) throw new Error(error.message);
        if (data.user.app_metadata?.must_change_password === true) {
          loginState.setRequestedPortal(portal ?? loginState.requestedPortal);
          router.replace('/(auth)/change-temporary-password');
          return;
        }
        const selectedPortal = portal ?? loginState.requestedPortal;
        if (selectedPortal) {
          const access = await validateCurrentPortal(selectedPortal);
          if (!access.ok) {
            router.replace({ pathname: selectedPortal === 'employee' ? '/employee' : '/(auth)/login', params: { notice: access.message } });
            return;
          }
        }
        loginState.setRequestedPortal(null);
        await refreshMembership();
        router.replace('/');
      } finally { loginState.setPending(false); }
    },
  });

  return <AuthScreen title="Vérification en deux étapes" subtitle="Confirmez votre identité pour continuer.">
    <TextInput mode="outlined" label="Code à 6 chiffres" accessibilityLabel="Code à 6 chiffres" autoComplete="one-time-code" value={code} onChangeText={value => setCode(value.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={6} />
    {!!(loadError || verify.error) && <HelperText type="error" visible>{loadError || verify.error?.message}</HelperText>}
    <AppButton icon="shield-check" loading={verify.isPending} disabled={!factorId || code.trim().length !== 6 || verify.isPending} onPress={() => verify.mutate()}>Vérifier</AppButton>
    <AppButton mode="text" onPress={() => void signOut()}>Se déconnecter</AppButton>
  </AuthScreen>;
}
