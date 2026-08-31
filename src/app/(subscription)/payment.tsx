import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Appbar, Card, HelperText, Icon, Text, useTheme } from 'react-native-paper';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppButton } from '@/components/ui/AppButton';
import { useAuth } from '@/features/auth/AuthProvider';
import { openAccountPortal } from '@/features/subscriptions/accountPortal';

export default function PaymentScreen() {
  const theme = useTheme();
  const { membership } = useAuth();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');

  const open = () => {
    if (opening || membership?.role !== 'company_admin') return;
    setOpening(true);
    setError('');
    void openAccountPortal(membership.companyId ?? '')
      .catch((caught) => setError(caught.message))
      .finally(() => setOpening(false));
  };

  return <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
    <Appbar.Header><AppBackButton fallback="/(subscription)" /><Appbar.Content title="Paiement de l’abonnement" /></Appbar.Header>
    <View style={styles.page}>
      <Card mode="contained" style={styles.card}>
        <Card.Content style={styles.content}>
          <View style={[styles.icon, { backgroundColor: theme.colors.primaryContainer }]}>
            <Icon source="open-in-new" size={34} color={theme.colors.primary} />
          </View>
          <Text variant="headlineSmall" style={styles.title}>Paiement sécurisé sur Account</Text>
          <Text style={styles.center}>
            Les forfaits, Orange Money, Stripe, les factures et les reçus sont gérés sur le portail web Account. Votre compte et votre entreprise seront déjà sélectionnés.
          </Text>
          <Text style={styles.center}>L’application StockMaster restera connectée pendant le paiement.</Text>
          {!!error && <HelperText type="error" visible>{error}</HelperText>}
          {membership?.role === 'company_admin'
            ? <AppButton icon="arrow-right" loading={opening} disabled={opening} onPress={open}>Continuer vers Account</AppButton>
            : <HelperText type="error" visible>Seul le propriétaire peut gérer l’abonnement.</HelperText>}
        </Card.Content>
      </Card>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  page: { flex: 1, width: '100%', maxWidth: 680, alignSelf: 'center', padding: 16, justifyContent: 'center' },
  card: { borderRadius: 22 },
  content: { alignItems: 'center', gap: 14, paddingVertical: 30 },
  icon: { width: 68, height: 68, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { fontWeight: '800', textAlign: 'center' },
  center: { textAlign: 'center', maxWidth: 520 },
});
