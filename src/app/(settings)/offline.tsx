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
  const { isOnline, isSynchronizing, lastSynchronizedAt, synchronize, refreshQueue } = useOffline();
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [removingBusy, setRemovingBusy] = useState(false);
  const [operations, setOperations] = useState<OfflineOperation[]>([]);
  const [removing, setRemoving] = useState<OfflineOperation | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try { setOperations(await getCurrentUserOfflineQueue()); setLoadError(''); }
    catch (error) { setLoadError(error instanceof Error ? error.message : 'Impossible de lire les opérations conservées.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load, isSynchronizing]);

  const remove = async () => {
    if (!removing) return;
    setRemovingBusy(true);
    try {
      await removeOfflineOperation(removing.id);
      setRemoving(null);
      await Promise.all([load(), refreshQueue()]);
    } catch (error) { setLoadError(error instanceof Error ? error.message : 'Impossible de retirer cette opération.'); }
    finally { setRemovingBusy(false); }
  };

  return <AdminPage title="Synchronisation">
    <Card mode="contained">
      <Card.Content style={styles.statusRow}><View style={[styles.statusIcon,{backgroundColor:theme.colors.primaryContainer}]}><Icon source={isOnline?'cloud-check-outline':'cloud-off-outline'} size={28} color={theme.colors.primary}/></View><View style={styles.copy}><Text variant="titleMedium" style={styles.bold}>{isOnline?'Connexion disponible':'Mode hors ligne'}</Text><Text style={{color:theme.colors.onSurfaceVariant}}>{loading || loadError ? 'Nombre d’opérations à vérifier' : `${operations.length} opération(s) en attente`}</Text><Text style={{color:theme.colors.onSurfaceVariant}}>Dernière synchronisation : {lastSynchronizedAt ? new Date(lastSynchronizedAt).toLocaleString('fr-FR') : 'non disponible dans cette session'}</Text></View></Card.Content>
      <Card.Actions style={[styles.actions,compact&&styles.actionsCompact]}><AppButton style={compact&&styles.mobileButton} icon="sync" disabled={!isOnline || isSynchronizing || loading || !!loadError || !operations.length} loading={isSynchronizing} onPress={() => void synchronize()}>Synchroniser maintenant</AppButton></Card.Actions>
    </Card>
    {loading && <Text>Lecture des opérations locales…</Text>}
    {!!loadError && <><HelperText type="error" visible>{loadError}</HelperText><AppButton mode="outlined" onPress={() => void load()}>Réessayer la lecture</AppButton></>}
    {!isOnline && <Text>Reconnectez cet appareil à Internet pour synchroniser.</Text>}
    {operations.map((operation) => {
      const failed = !!operation.lastError;
      const presentation = operation.type === 'sale'
        ? { title: 'Vente en attente', icon: 'cart-clock' }
        : operation.type === 'cash'
          ? { title: 'Mouvement de caisse en attente', icon: 'cash-clock' }
          : { title: 'Dépense en attente', icon: 'receipt-clock-outline' };
      return <Card key={operation.id} mode="outlined">
        <Card.Content style={styles.operationContent}><View style={styles.operationHeader}><Icon source={presentation.icon} size={28} color={theme.colors.primary}/><View style={styles.copy}><Text variant="titleMedium" style={styles.bold}>{presentation.title}</Text><Text style={{color:theme.colors.onSurfaceVariant}}>{new Date(operation.createdAt).toLocaleString('fr-FR')} • appareil {operation.deviceId?.slice(0,8)??'ancien'}</Text></View></View><Chip style={styles.chip} icon={failed?'alert-circle-outline':'clock-outline'}>{failed?'À vérifier':'En attente de synchronisation'}</Chip>
          <Text>{offlineErrorMessage(operation)}</Text>
          {failed && <HelperText type="error" visible>Échec après {operation.attempts} tentative(s). L’opération n’a pas été perdue.</HelperText>}
        </Card.Content>
        <Card.Actions style={[styles.actions,compact&&styles.actionsCompact]}><AppButton style={compact&&styles.mobileButton} mode="text" textColor="#C92A2A" onPress={() => setRemoving(operation)}>Annuler l’opération</AppButton></Card.Actions>
      </Card>;
    })}
    {!loading && !loadError && !operations.length && <EmptyState icon="cloud-check-outline" title="Aucune opération en attente" message="Aucune opération locale ne reste dans la file. Retrouvez les ventes confirmées dans leur historique." />}
    <ConfirmDialog visible={!!removing} title="Retirer cette opération locale ?" message="Elle sera retirée de cet appareil. Si le serveur l’a déjà reçue, cette suppression ne l’annule pas : vérifiez l’historique avant de recréer une vente." destructive loading={removingBusy} onCancel={() => setRemoving(null)} onConfirm={() => void remove()} />
  </AdminPage>;
}

const styles=StyleSheet.create({statusRow:{flexDirection:'row',alignItems:'center',gap:12},statusIcon:{width:48,height:48,borderRadius:16,alignItems:'center',justifyContent:'center'},copy:{flex:1,minWidth:0,gap:2},bold:{fontWeight:'800'},actions:{flexWrap:'wrap',paddingHorizontal:12,paddingBottom:12},actionsCompact:{flexDirection:'column',alignItems:'stretch'},mobileButton:{width:'100%'},operationContent:{gap:12},operationHeader:{flexDirection:'row',alignItems:'center',gap:12},chip:{alignSelf:'flex-start'}});
