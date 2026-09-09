import { useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { Card, HelperText, Text } from 'react-native-paper';
import { AppButton } from '@/components/ui/AppButton';
import { useAuth } from '@/features/auth/AuthProvider';
import { accessCheckMessage, accessDiagnosticReport, diagnoseAccess, type AccessCheck } from '@/features/auth/accessDiagnostics';

export function AccessDiagnosticsCard({ saleId }: { saleId?: string }) {
  const { membership } = useAuth();
  const [checks, setChecks] = useState<AccessCheck[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const run = async () => {
    setLoading(true); setFeedback(''); setChecks([]);
    try { setChecks(await diagnoseAccess(membership, saleId)); }
    catch { setFeedback('Vérification interrompue. Réessayez.'); }
    finally { setLoading(false); }
  };
  return <Card mode="outlined">
    <Card.Title title="Vérifier les accès" />
    <Card.Content style={{ gap: 8 }}>
      <Text>En cas d’erreurs sur plusieurs écrans, vérifiez la connexion et les réponses du serveur pour votre compte.</Text>
      {checks.map(item => <Text key={item.operation}>{item.ok ? '✓' : '•'} {item.label} : {accessCheckMessage(item)}{item.code ? ` (${item.code})` : ''}</Text>)}
      {checks.length > 0 && <Text variant="bodySmall">Une réponse reçue ne garantit pas que toutes les données sont accessibles. Le bilan copié contient uniquement les contrôles et leurs codes d’erreur.</Text>}
      {!!feedback && <HelperText type="info" visible>{feedback}</HelperText>}
    </Card.Content>
    <Card.Actions style={{ flexWrap: 'wrap' }}>
      <AppButton mode="outlined" loading={loading} disabled={loading} onPress={() => void run()}>Vérifier les accès</AppButton>
      {checks.length > 0 && <AppButton mode="text" onPress={() => {
        void Clipboard.setStringAsync(accessDiagnosticReport(checks)).then(() => setFeedback('Bilan copié. Vous pouvez le transmettre à l’assistance.')).catch(() => setFeedback('Copie indisponible. Les résultats restent affichés ci-dessus.'));
      }}>Copier le bilan</AppButton>}
    </Card.Actions>
  </Card>;
}
