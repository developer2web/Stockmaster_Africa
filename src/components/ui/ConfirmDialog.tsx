import { Dialog, Portal, Text, TextInput } from 'react-native-paper';
import { ScrollView, useWindowDimensions } from 'react-native';
import { AppButton } from './AppButton';

// reason/onReasonChange sont facultatifs : les passer transforme la boîte en
// confirmation avec motif obligatoire (au moins 3 caractères) avant que
// « Confirmer » ne s'active — sinon le comportement reste identique à avant,
// aucun appel existant à modifier.
export function ConfirmDialog({ visible, title, message, destructive=false, loading=false, reason, onReasonChange, reasonLabel='Motif (obligatoire)', onCancel, onConfirm }: { visible:boolean; title:string; message:string; destructive?:boolean; loading?:boolean; reason?:string; onReasonChange?:(value:string)=>void; reasonLabel?:string; onCancel:()=>void; onConfirm:()=>void }) {
  const { width, height } = useWindowDimensions();
  const requiresReason = onReasonChange !== undefined;
  const reasonValid = !requiresReason || (reason ?? '').trim().length >= 3;
  return <Portal><Dialog style={{width:Math.min(520,width-32),alignSelf:'center',borderRadius:16}} visible={visible} dismissable={!loading} onDismiss={onCancel}><Dialog.Title>{title}</Dialog.Title><Dialog.ScrollArea><ScrollView style={{ maxHeight: Math.max(240, height * 0.45) }} contentContainerStyle={{ paddingVertical: 12, gap: 12 }}><Text>{message}</Text>{requiresReason && <TextInput mode="outlined" label={reasonLabel} accessibilityLabel={reasonLabel} value={reason ?? ''} onChangeText={onReasonChange} multiline disabled={loading} />}</ScrollView></Dialog.ScrollArea><Dialog.Actions style={{ flexWrap: 'wrap',gap:8 }}><AppButton mode="outlined" disabled={loading} onPress={onCancel}>Annuler</AppButton><AppButton destructive={destructive} loading={loading} disabled={!reasonValid} onPress={onConfirm}>Confirmer</AppButton></Dialog.Actions></Dialog></Portal>;
}
