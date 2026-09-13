import { useMutation, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Card, HelperText, Icon, Text, TextInput, useTheme } from 'react-native-paper';

import { AppButton } from '@/components/ui/AppButton';
import { AuthScreen } from '@/features/auth/AuthScreen';
import { getOfflineAccessSummary } from '@/features/auth/offlineAccess';
import { useAuth } from '@/features/auth/AuthProvider';

function formatDate(value: string | null | undefined) {
  if (!value) return 'aucune synchronisation enregistrée';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export default function OfflineLoginScreen() {
  const theme = useTheme();
  const { offlineUnlockRequired, unlockOfflineSession, retryOnlineAccess } = useAuth();
  const profile = useQuery({ queryKey: ['offline-access-summary'], queryFn: () => getOfflineAccessSummary() });
  const [offlineId, setOfflineId] = useState('');
  const [pin, setPin] = useState('');

  useEffect(() => {
    if (profile.data?.offlineId) setOfflineId(profile.data.offlineId);
  }, [profile.data?.offlineId]);

  useEffect(() => {
    if (!offlineUnlockRequired) router.replace('/');
  }, [offlineUnlockRequired]);

  const unlock = useMutation({ meta: { allowReadOnly: true },
    mutationFn: () => unlockOfflineSession(offlineId, pin),
    onSuccess: (result) => {
      if (result.ok) router.replace('/');
    },
  });

  const retry = useMutation({ meta: { allowReadOnly: true },
    mutationFn: retryOnlineAccess,
    onSuccess: (online) => {
      if (online) router.replace('/');
    },
  });

  const resultError = unlock.data && !unlock.data.ok ? unlock.data.message : '';
  const unavailable = !profile.isLoading && (!profile.data || profile.data.expired);

  return <AuthScreen title="Accès hors ligne" subtitle="Internet ou StockMaster est momentanément indisponible.">
    <Card mode="contained" style={{ backgroundColor: theme.colors.primaryContainer }}>
      <Card.Title title="Appareil autorisé" subtitle="Utilisez l’ID et le PIN créés sur ce téléphone" left={() => <Icon source="cellphone-key" size={32} color={theme.colors.primary} />} />
    </Card>

    {!unavailable && <>
      <TextInput mode="outlined" label="ID hors ligne" value={offlineId} onChangeText={(value) => setOfflineId(value.toUpperCase())} autoCapitalize="characters" autoCorrect={false} />
      <TextInput mode="outlined" label="PIN à 6 chiffres" value={pin} onChangeText={(value) => setPin(value.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" secureTextEntry maxLength={6} onSubmitEditing={() => pin.length === 6 && unlock.mutate()} />
      {!!resultError && <HelperText type="error" visible>{resultError}</HelperText>}
      <AppButton icon="lock-open-check" loading={unlock.isPending} disabled={unlock.isPending || !/^SM-\d{5}$/.test(offlineId.trim()) || pin.length !== 6} onPress={() => unlock.mutate()}>Se connecter hors ligne</AppButton>
      <Text style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>Dernière synchronisation : {formatDate(profile.data?.lastSynchronizedAt ?? profile.data?.lastServerValidationAt)}</Text>
    </>}

    {unavailable && <HelperText type="error" visible>
      {profile.data?.expired
        ? 'L’autorisation de 24 heures a expiré. Une connexion Internet est obligatoire.'
        : 'Aucun accès hors ligne valide n’est configuré sur cet appareil.'}
    </HelperText>}

    <AppButton mode="text" icon="refresh" loading={retry.isPending} disabled={retry.isPending} onPress={() => retry.mutate()}>Réessayer la connexion</AppButton>
    {retry.data === false && <HelperText type="info" visible>StockMaster est toujours indisponible. Vous pouvez utiliser votre accès hors ligne autorisé.</HelperText>}
  </AuthScreen>;
}
