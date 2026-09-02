import { Icon, Text, useTheme } from 'react-native-paper';
import { router } from 'expo-router';
import { useOffline } from './OfflineProvider';
import { Pressable, StyleSheet, View } from 'react-native';

export function OfflineStatus() {
  const theme=useTheme();
  const { isOnline, isSynchronizing, pendingCount,lastSyncedCount, synchronize } = useOffline();
  const visible=!isOnline||isSynchronizing||pendingCount>0||lastSyncedCount>0;
  const message = !isOnline
    ? `Mode hors ligne${pendingCount ? ` • ${pendingCount} opération(s) en attente` : ''}`
    : isSynchronizing
      ? 'Synchronisation en cours…'
      : pendingCount?`${pendingCount} opération(s) à synchroniser`:`${lastSyncedCount} opération(s) sauvegardée(s) sur le serveur`;
  if(!visible)return null;
  const label = message;
  const color=!isOnline?theme.colors.error:isSynchronizing||pendingCount?'#9A5700':theme.colors.primary;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${label}. Ouvrir la synchronisation`} onPress={()=>router.push('/(settings)/offline' as never)} style={[styles.bar,{backgroundColor:theme.colors.surface,borderBottomColor:theme.colors.outlineVariant}]}>
    <View style={styles.row}><Icon source={!isOnline?'wifi-off':isSynchronizing?'sync':'cloud-check-outline'} size={16} color={color}/><Text variant="labelSmall" numberOfLines={1} style={[styles.label,{color}]}>{label}</Text></View>
    {isOnline&&pendingCount>0&&<Pressable accessibilityRole="button" onPress={(event)=>{event.stopPropagation();void synchronize();}}><Text variant="labelSmall" style={[styles.sync,{color:theme.colors.primary}]}>Synchroniser</Text></Pressable>}
  </Pressable>;
}
const styles=StyleSheet.create({bar:{minHeight:30,borderBottomWidth:1,paddingHorizontal:12,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:12},row:{minWidth:0,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6},label:{fontWeight:'800',flexShrink:1},sync:{fontWeight:'900'}});
