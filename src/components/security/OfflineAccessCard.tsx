import * as Clipboard from 'expo-clipboard';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Card, Chip, HelperText, Icon, Text, TextInput, useTheme } from 'react-native-paper';

import { AppButton } from '@/components/ui/AppButton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  disableOfflineAccess,
  enableOfflineAccess,
  getOfflineAccessSummary,
  prepareOfflineAccessId,
  validateOfflinePin,
} from '@/features/auth/offlineAccess';
import { useAuth } from '@/features/auth/AuthProvider';
import { probeBackendAccess } from '@/features/offline/connectivity';
import { getSaleStock } from '@/features/sales/api';
import { getCustomers } from '@/features/customers/api';
import { getCompany } from '@/features/employees/api';

const queryKey = ['offline-access-summary'];

function formatDate(value: string | null | undefined) {
  if (!value) return 'Jamais';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function OfflineAccessCard() {
  const theme = useTheme();
  const cache = useQueryClient();
  const { session, membership, businesses, stores, offlineAuthenticated } = useAuth();
  const [setupOpen, setSetupOpen] = useState(false);
  const [preparedId, setPreparedId] = useState('');
  const [disableOpen, setDisableOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [formError, setFormError] = useState('');
  const [copied, setCopied] = useState(false);
  const summary = useQuery({ queryKey, queryFn: () => getOfflineAccessSummary(), enabled: Platform.OS !== 'web' });

  const prepare = useMutation({
    mutationFn: async () => {
      if (!session?.user || !membership) throw new Error('Reconnectez-vous avant d’activer l’accès hors ligne.');
      const backend = await probeBackendAccess(true);
      if (!backend.reachable || !backend.authenticated) throw new Error('Une connexion réelle à StockMaster est obligatoire pour cette activation.');
      if (!membership.companyId || !membership.storeId) throw new Error('Sélectionnez une entreprise et une boutique.');
      if (membership.role === 'employee' && !membership.permissions.includes('sales.write')) {
        throw new Error('Cet employé doit être autorisé à créer des ventes.');
      }
      await Promise.all([
        getSaleStock(membership.companyId, membership.storeId, membership.role === 'company_admin'),
        getCustomers(membership.companyId),
        getCompany(membership.companyId),
      ]);
      return prepareOfflineAccessId(session.user.id);
    },
    onSuccess: (offlineId) => {
      setPreparedId(offlineId);
      setPin('');
      setConfirmPin('');
      setFormError('');
      setSetupOpen(true);
    },
  });

  const activate = useMutation({
    mutationFn: async () => {
      if (!session?.user || !membership) throw new Error('Reconnectez-vous avant d’activer l’accès hors ligne.');
      const pinError = validateOfflinePin(pin);
      if (pinError) throw new Error(pinError);
      if (pin !== confirmPin) throw new Error('Les deux PIN ne correspondent pas.');
      const backend = await probeBackendAccess(true);
      if (!backend.reachable || !backend.authenticated) throw new Error('Internet est nécessaire pour valider ce PIN.');
      return enableOfflineAccess({
        userId: session.user.id,
        email: session.user.email ?? '',
        fullName: String(session.user.user_metadata?.full_name ?? session.user.email ?? ''),
        pin,
        offlineId: preparedId,
        membership,
        businesses,
        stores,
      });
    },
    onSuccess: async () => {
      setSetupOpen(false);
      setPreparedId('');
      setPin('');
      setConfirmPin('');
      setFormError('');
      await cache.invalidateQueries({ queryKey });
    },
  });

  const deactivate = useMutation({
    mutationFn: disableOfflineAccess,
    onSuccess: async () => {
      setDisableOpen(false);
      setSetupOpen(false);
      setPreparedId('');
      await cache.invalidateQueries({ queryKey });
    },
  });

  if (Platform.OS === 'web' || membership?.role === 'super_admin') return null;
  const active = !!summary.data;
  const displayedId = preparedId || summary.data?.offlineId || '';

  const startSetup = () => {
    prepare.reset();
    activate.reset();
    setFormError('');
    prepare.mutate();
  };

  const submit = () => {
    setFormError('');
    const pinError = validateOfflinePin(pin);
    if (pinError) return setFormError(pinError);
    if (pin !== confirmPin) return setFormError('Les deux PIN ne correspondent pas.');
    activate.mutate();
  };

  const copyId = async () => {
    if (!displayedId) return;
    await Clipboard.setStringAsync(displayedId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return <>
    <Card mode="outlined">
      <Card.Content style={styles.stack}>
        <View style={styles.header}>
          <View style={[styles.icon, { backgroundColor: theme.colors.primaryContainer }]}>
            <Icon source="cellphone-key" size={28} color={theme.colors.primary} />
          </View>
          <View style={styles.copy}>
            <Text variant="titleMedium" style={styles.bold}>Accès hors ligne sur cet appareil</Text>
            <Text style={{ color: theme.colors.onSurfaceVariant }}>ID local + PIN, valable 24 h après la dernière validation du serveur.</Text>
          </View>
          <Chip icon={active && !summary.data?.expired ? 'check' : 'minus'}>
            {active ? (summary.data?.expired ? 'À renouveler' : 'Activé') : setupOpen ? 'À valider' : 'Inactif'}
          </Chip>
        </View>

        {(active || setupOpen) && <View style={[styles.identity, { backgroundColor: theme.colors.surfaceVariant }]}>
          <View style={styles.copy}>
            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>ID hors ligne</Text>
            <Text variant="headlineSmall" selectable style={styles.offlineId}>{displayedId}</Text>
            {active && <>
              <Text style={{ color: theme.colors.onSurfaceVariant }}>Dernière validation : {formatDate(summary.data?.lastServerValidationAt)}</Text>
              <Text style={{ color: theme.colors.onSurfaceVariant }}>Dernière synchronisation : {formatDate(summary.data?.lastSynchronizedAt)}</Text>
            </>}
          </View>
          <AppButton mode="outlined" icon={copied ? 'check' : 'content-copy'} onPress={() => void copyId()}>{copied ? 'Copié' : 'Copier'}</AppButton>
        </View>}

        {setupOpen && <View style={styles.pinSetup}>
          <Text variant="titleMedium" style={styles.bold}>Choisissez maintenant votre PIN</Text>
          <Text style={{ color: theme.colors.onSurfaceVariant }}>Saisissez puis confirmez un PIN local de 6 chiffres pour finaliser l’activation.</Text>
          <TextInput mode="outlined" label="PIN à 6 chiffres" value={pin} onChangeText={(value) => setPin(value.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" secureTextEntry maxLength={6} />
          <TextInput mode="outlined" label="Confirmer le PIN" value={confirmPin} onChangeText={(value) => setConfirmPin(value.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" secureTextEntry maxLength={6} />
          {!!formError && <HelperText type="error" visible>{formError}</HelperText>}
          {!!activate.error && <HelperText type="error" visible>{activate.error.message}</HelperText>}
          <View style={styles.actions}>
            <AppButton mode="text" disabled={activate.isPending} onPress={() => { setSetupOpen(false); setPreparedId(''); }}>Annuler</AppButton>
            <AppButton icon="check" loading={activate.isPending} disabled={activate.isPending || pin.length !== 6 || confirmPin.length !== 6} onPress={submit}>Valider le PIN</AppButton>
          </View>
        </View>}

        <HelperText type="info" visible>Ce PIN sert uniquement sur cet appareil lorsque StockMaster est indisponible. Ce n’est pas la 2FA et il ne l’active jamais.</HelperText>
        {!!prepare.error && <HelperText type="error" visible>{prepare.error.message}</HelperText>}
      </Card.Content>
      {!setupOpen && <Card.Actions style={styles.actions}>
        {active
          ? <>
            <AppButton mode="outlined" icon="key-change" loading={prepare.isPending} disabled={offlineAuthenticated || prepare.isPending} onPress={startSetup}>Changer le PIN</AppButton>
            <AppButton mode="text" destructive icon="close-circle-outline" disabled={offlineAuthenticated} onPress={() => setDisableOpen(true)}>Désactiver</AppButton>
          </>
          : <AppButton icon="cellphone-lock" loading={prepare.isPending} disabled={offlineAuthenticated || prepare.isPending} onPress={startSetup}>Activer sur cet appareil</AppButton>}
      </Card.Actions>}
    </Card>

    <ConfirmDialog
      visible={disableOpen}
      title="Désactiver l’accès hors ligne ?"
      message="L’ID et le PIN de cet appareil seront supprimés. Une connexion Internet sera nécessaire pour les réactiver."
      destructive
      loading={deactivate.isPending}
      onCancel={() => setDisableOpen(false)}
      onConfirm={() => deactivate.mutate()}
    />
  </>;
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  icon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 190, gap: 3 },
  bold: { fontWeight: '800' },
  identity: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16 },
  offlineId: { fontWeight: '900', letterSpacing: 1.2 },
  pinSetup: { gap: 10 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, paddingHorizontal: 12, paddingBottom: 12 },
});
