import { Dialog, Portal, Text } from 'react-native-paper';
import { useWindowDimensions } from 'react-native';
import { AppButton } from './AppButton';

export function ConfirmDialog({ visible, title, message, destructive=false, loading=false, onCancel, onConfirm }: { visible:boolean; title:string; message:string; destructive?:boolean; loading?:boolean; onCancel:()=>void; onConfirm:()=>void }) {
  const { width } = useWindowDimensions();
  return <Portal><Dialog style={{width:Math.min(520,width-32),alignSelf:'center',borderRadius:16}} visible={visible} dismissable={!loading} onDismiss={onCancel}><Dialog.Title>{title}</Dialog.Title><Dialog.Content><Text>{message}</Text></Dialog.Content><Dialog.Actions style={{ flexWrap: 'wrap',gap:8 }}><AppButton mode="outlined" disabled={loading} onPress={onCancel}>Annuler</AppButton><AppButton destructive={destructive} loading={loading} onPress={onConfirm}>Confirmer</AppButton></Dialog.Actions></Dialog></Portal>;
}
