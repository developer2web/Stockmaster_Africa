import { Button, Dialog, Portal, Text } from 'react-native-paper';

export function ConfirmDialog({ visible, title, message, destructive=false, loading=false, onCancel, onConfirm }: { visible:boolean; title:string; message:string; destructive?:boolean; loading?:boolean; onCancel:()=>void; onConfirm:()=>void }) {
  return <Portal><Dialog visible={visible} onDismiss={onCancel}><Dialog.Title>{title}</Dialog.Title><Dialog.Content><Text>{message}</Text></Dialog.Content><Dialog.Actions><Button onPress={onCancel}>Annuler</Button><Button textColor={destructive?'#C92A2A':undefined} loading={loading} onPress={onConfirm}>Confirmer</Button></Dialog.Actions></Dialog></Portal>;
}
