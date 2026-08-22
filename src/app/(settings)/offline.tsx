import { useCallback, useEffect, useState } from 'react';
import { Card, Chip, HelperText, Icon, Text } from 'react-native-paper';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { useOffline } from '@/features/offline/OfflineProvider';
import { getCurrentUserOfflineQueue, OfflineOperation, offlineErrorMessage, removeOfflineOperation } from '@/features/offline/queue';

export default function OfflineOperationsScreen() {
  const { isOnline, isSynchronizing, synchronize, refreshQueue } = useOffline();
  const [operations, setOperations] = useState<OfflineOperation[]>([]);
  const [removing, setRemoving] = useState<OfflineOperation | null>(null);
  const load = useCallback(async () => setOperations(await getCurrentUserOfflineQueue()), []);
  useEffect(() => { void load(); }, [load, isSynchronizing]);

  const remove = async () => {
    if (!removing) return;
    await removeOfflineOperation(removing.id);
    setRemoving(null);
    await Promise.all([load(), refreshQueue()]);
  };

  return <AdminPage title="Synchronisation">
    <Card mode="contained">
      <Card.Title title={isOnline ? 'Connexion disponible' : 'Mode hors ligne'} subtitle={`${operations.length} opération(s) en attente`} left={() => <Icon source={isOnline ? 'cloud-check-outline' : 'cloud-off-outline'} size={30} />} />
      <Card.Actions><AppButton icon="sync" disabled={!isOnline || isSynchronizing || !operations.length} loading={isSynchronizing} onPress={() => void synchronize()}>Synchroniser maintenant</AppButton></Card.Actions>
    </Card>
    {operations.map((operation) => {
      const failed = operation.attempts > 0;
      return <Card key={operation.id} mode="outlined">
        <Card.Title title={operation.type === 'sale' ? 'Vente en attente' : 'Dépense en attente'} subtitle={`${new Date(operation.createdAt).toLocaleString('fr-FR')} • appareil ${operation.deviceId?.slice(0,8)??'ancien'}`} left={() => <Icon source={operation.type === 'sale' ? 'cart-clock' : 'cash-clock'} size={28} />} right={() => <Chip style={{ marginRight: 12 }} icon={failed ? 'alert-circle-outline' : 'clock-outline'}>{failed ? 'Conflit à résoudre' : 'Non synchronisée'}</Chip>} />
        <Card.Content>
          <Text>{offlineErrorMessage(operation)}</Text>
          {failed && <HelperText type="error" visible>Échec après {operation.attempts} tentative(s). L’opération n’a pas été perdue.</HelperText>}
        </Card.Content>
        <Card.Actions><AppButton mode="text" textColor="#C92A2A" onPress={() => setRemoving(operation)}>Annuler l’opération</AppButton></Card.Actions>
      </Card>;
    })}
    {!operations.length && <EmptyState icon="cloud-check-outline" title="Tout est synchronisé" message="Aucune vente ou dépense n’attend un envoi vers Supabase." />}
    <ConfirmDialog visible={!!removing} title="Annuler cette opération ?" message="Elle sera retirée définitivement de la file locale et ne sera jamais envoyée au serveur." destructive onCancel={() => setRemoving(null)} onConfirm={() => void remove()} />
  </AdminPage>;
}
