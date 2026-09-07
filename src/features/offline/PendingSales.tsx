import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Card, HelperText, Text } from 'react-native-paper';
import { AppButton } from '@/components/ui/AppButton';
import { useAuth } from '@/features/auth/AuthProvider';
import { getCurrentUserOfflineQueue, offlineErrorMessage } from './queue';
import { useOffline } from './OfflineProvider';

export function PendingSales() {
  const { session, membership } = useAuth();
  const { pendingCount, isSynchronizing } = useOffline();
  const queue = useQuery({
    queryKey: ['pending-sales', session?.user.id, membership?.storeId, pendingCount, isSynchronizing],
    queryFn: getCurrentUserOfflineQueue, enabled: !!session, refetchInterval: 5000,
  });
  const sales = queue.data?.filter(operation => operation.type === 'sale' && operation.payload.p_store_id === membership?.storeId) ?? [];
  if (queue.error) return <><HelperText type="error" visible>Le suivi local ne peut pas être lu. Les données sont conservées. Ouvrez la synchronisation pour réessayer.</HelperText><AppButton mode="outlined" onPress={() => router.push('/(settings)/offline')}>Ouvrir la synchronisation</AppButton></>;
  if (!sales.length) return null;
  return <Card mode="outlined"><Card.Content style={{ gap: 8 }}>
    <Text variant="titleMedium">Ventes conservées sur cet appareil ({sales.length})</Text>
    {sales.slice(0, 5).map(operation => <Card key={operation.id} mode="contained"><Card.Content style={{ gap: 4 }}>
      <Text>HORS-LIGNE-{operation.id.slice(-8).toUpperCase()} · {new Date(operation.createdAt).toLocaleString('fr-FR')}</Text>
      <Text style={{ fontWeight: '700' }}>{operation.lastError ? 'À vérifier' : 'En attente de synchronisation'}</Text>
      <Text>{operation.lastError ? offlineErrorMessage(operation) : 'Conservée sur cet appareil ; confirmation du serveur en attente.'}</Text>
    </Card.Content></Card>)}
    <AppButton mode="outlined" icon="sync" onPress={() => router.push('/(settings)/offline')}>Suivre la synchronisation</AppButton>
  </Card.Content></Card>;
}
