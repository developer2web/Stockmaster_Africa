import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Card, Chip, HelperText, Icon, Text, useTheme } from 'react-native-paper';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { useOffline } from '@/features/offline/OfflineProvider';
import { getCurrentUserOfflineQueue, OfflineOperation, offlineErrorMessage, removeOfflineOperation } from '@/features/offline/queue';

export default function OfflineOperationsScreen() {
  const theme=useTheme();
  const {width}=useWindowDimensions();
  const compact=width<600;
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
      <Card.Content style={styles.statusRow}><View style={[styles.statusIcon,{backgroundColor:theme.colors.primaryContainer}]}><Icon source={isOnline?'cloud-check-outline':'cloud-off-outline'} size={28} color={theme.colors.primary}/></View><View style={styles.copy}><Text variant="titleMedium" style={styles.bold}>{isOnline?'Connexion disponible':'Mode hors ligne'}</Text><Text style={{color:theme.colors.onSurfaceVariant}}>{operations.length} opération(s) en attente</Text></View></Card.Content>
      <Card.Actions style={[styles.actions,compact&&styles.actionsCompact]}><AppButton style={compact&&styles.mobileButton} icon="sync" disabled={!isOnline || isSynchronizing || !operations.length} loading={isSynchronizing} onPress={() => void synchronize()}>Synchroniser maintenant</AppButton></Card.Actions>
    </Card>
    {operations.map((operation) => {
      const failed = operation.attempts > 0;
      const presentation = operation.type === 'sale'
        ? { title: 'Vente en attente', icon: 'cart-clock' }
        : operation.type === 'cash'
          ? { title: 'Mouvement de caisse en attente', icon: 'cash-clock' }
          : { title: 'Dépense en attente', icon: 'receipt-clock-outline' };
      return <Card key={operation.id} mode="outlined">
        <Card.Content style={styles.operationContent}><View style={styles.operationHeader}><Icon source={presentation.icon} size={28} color={theme.colors.primary}/><View style={styles.copy}><Text variant="titleMedium" style={styles.bold}>{presentation.title}</Text><Text style={{color:theme.colors.onSurfaceVariant}}>{new Date(operation.createdAt).toLocaleString('fr-FR')} • appareil {operation.deviceId?.slice(0,8)??'ancien'}</Text></View></View><Chip style={styles.chip} icon={failed?'alert-circle-outline':'clock-outline'}>{failed?'Conflit à résoudre':'Non synchronisée'}</Chip>
          <Text>{offlineErrorMessage(operation)}</Text>
          {failed && <HelperText type="error" visible>Échec après {operation.attempts} tentative(s). L’opération n’a pas été perdue.</HelperText>}
        </Card.Content>
        <Card.Actions style={[styles.actions,compact&&styles.actionsCompact]}><AppButton style={compact&&styles.mobileButton} mode="text" textColor="#C92A2A" onPress={() => setRemoving(operation)}>Annuler l’opération</AppButton></Card.Actions>
      </Card>;
    })}
    {!operations.length && <EmptyState icon="cloud-check-outline" title="Tout est synchronisé" message="Aucune vente, dépense ou opération de caisse n’attend un envoi vers Supabase." />}
    <ConfirmDialog visible={!!removing} title="Annuler cette opération ?" message="Elle sera retirée définitivement de la file locale et ne sera jamais envoyée au serveur." destructive onCancel={() => setRemoving(null)} onConfirm={() => void remove()} />
  </AdminPage>;
}

const styles=StyleSheet.create({statusRow:{flexDirection:'row',alignItems:'center',gap:12},statusIcon:{width:48,height:48,borderRadius:16,alignItems:'center',justifyContent:'center'},copy:{flex:1,minWidth:0,gap:2},bold:{fontWeight:'800'},actions:{flexWrap:'wrap',paddingHorizontal:12,paddingBottom:12},actionsCompact:{flexDirection:'column',alignItems:'stretch'},mobileButton:{width:'100%'},operationContent:{gap:12},operationHeader:{flexDirection:'row',alignItems:'center',gap:12},chip:{alignSelf:'flex-start'}});
