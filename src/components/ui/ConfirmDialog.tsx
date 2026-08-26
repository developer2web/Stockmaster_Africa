import { Dialog, Portal, Text } from 'react-native-paper';
import { AppButton } from './AppButton';

export function ConfirmDialog({ visible, title, message, destructive=false, loading=false, onCancel, onConfirm }: { visible:boolean; title:string; message:string; destructive?:boolean; loading?:boolean; onCancel:()=>void; onConfirm:()=>void }) {
  return <Portal><Dialog visible={visible} dismissable={!loading} onDismiss={onCancel}><Dialog.Title>{title}</Dialog.Title><Dialog.Content><Text>{message}</Text></Dialog.Content><Dialog.Actions style={{ flexWrap: 'wrap',gap:8 }}><AppButton mode="outlined" disabled={loading} onPress={onCancel}>Annuler</AppButton><AppButton destructive={destructive} loading={loading} onPress={onConfirm}>Confirmer</AppButton></Dialog.Actions></Dialog></Portal>;
}
