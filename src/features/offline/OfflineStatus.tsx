import { Banner } from 'react-native-paper';
import { router } from 'expo-router';
import { useOffline } from './OfflineProvider';

export function OfflineStatus() {
  const { isOnline, isSynchronizing, pendingCount,lastSyncedCount, synchronize } = useOffline();
  const visible = !isOnline || isSynchronizing || pendingCount > 0 || lastSyncedCount>0;
  const message = !isOnline
    ? `Mode hors ligne${pendingCount ? ` • ${pendingCount} opération(s) en attente` : ''}`
    : isSynchronizing
      ? 'Synchronisation en cours…'
      : pendingCount?`${pendingCount} opération(s) à synchroniser`:`${lastSyncedCount} opération(s) sauvegardée(s) sur le serveur`;
  const actions = pendingCount
    ? [{ label: 'Voir', onPress: () => router.push('/(settings)/offline' as never) }, ...(isOnline ? [{ label: 'Synchroniser', onPress: () => void synchronize() }] : [])]
    : [];
  return <Banner visible={visible} icon={isOnline ? 'sync' : 'wifi-off'} actions={actions}>{message}</Banner>;
}
