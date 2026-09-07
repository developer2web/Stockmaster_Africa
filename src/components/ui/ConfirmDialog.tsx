import { Dialog, Portal, Text } from 'react-native-paper';
import { ScrollView, useWindowDimensions } from 'react-native';
import { AppButton } from './AppButton';

export function ConfirmDialog({ visible, title, message, destructive=false, loading=false, onCancel, onConfirm }: { visible:boolean; title:string; message:string; destructive?:boolean; loading?:boolean; onCancel:()=>void; onConfirm:()=>void }) {
  const { width, height } = useWindowDimensions();
  return <Portal><Dialog style={{width:Math.min(520,width-32),alignSelf:'center',borderRadius:16}} visible={visible} dismissable={!loading} onDismiss={onCancel}><Dialog.Title>{title}</Dialog.Title><Dialog.ScrollArea><ScrollView style={{ maxHeight: Math.max(80, height * 0.45) }} contentContainerStyle={{ paddingVertical: 12 }}><Text>{message}</Text></ScrollView></Dialog.ScrollArea><Dialog.Actions style={{ flexWrap: 'wrap',gap:8 }}><AppButton mode="outlined" disabled={loading} onPress={onCancel}>Annuler</AppButton><AppButton destructive={destructive} loading={loading} onPress={onConfirm}>Confirmer</AppButton></Dialog.Actions></Dialog></Portal>;
}
