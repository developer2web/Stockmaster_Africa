import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Avatar, Card, Dialog, HelperText, Icon, Portal, Switch, Text, useTheme } from 'react-native-paper';

import { FormField } from '@/components/forms/FormField';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusChip } from '@/components/ui/StatusChip';
import { AppFeedback } from '@/components/ui/AppFeedback';
import { useAuth } from '@/features/auth/AuthProvider';
import { getStores, saveStore } from '@/features/employees/api';
import { storeSchema, type StoreInput } from '@/schemas/organization';
import type { Store } from '@/types/database';
import { useSubscription } from '@/features/subscriptions/SubscriptionProvider';
import { router } from 'expo-router';

const emptyStore: StoreInput = {
  name: '', address: '', isActive: true, receiptDisplayName: '', receiptAddress: '',
  receiptPhone: '', receiptEmail: '', receiptLogoUrl: '', receiptFooter: '', receiptAccentColor: '#084B50',
};

function storeValues(store: Store): StoreInput {
  return {
    name: store.name, address: store.address ?? '', isActive: store.is_active,
    receiptDisplayName: store.receipt_display_name ?? '', receiptAddress: store.receipt_address ?? '',
    receiptPhone: store.receipt_phone ?? '', receiptEmail: store.receipt_email ?? '',
    receiptLogoUrl: store.receipt_logo_url ?? '', receiptFooter: store.receipt_footer ?? '',
    receiptAccentColor: store.receipt_accent_color ?? '#084B50',
  };
}

export default function StoresScreen() {
  const theme = useTheme();
  const { membership } = useAuth();
  const { canUseFeature } = useSubscription();
  const companyId = membership?.companyId ?? '';
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Store | null>(null);
  const [discard,setDiscard]=useState(false);
  const [message,setMessage]=useState('');
  const stores = useQuery({ queryKey: ['stores', companyId], queryFn: () => getStores(companyId), enabled: !!companyId });
  const { control, handleSubmit, reset, watch,formState:{isDirty,isValid} } = useForm<StoreInput>({ resolver: zodResolver(storeSchema), defaultValues: emptyStore,mode:'onChange' });
  const preview = watch();
  const canAddStore = canUseFeature('multi_store') || !stores.data?.length;

  useEffect(() => { reset(editing ? storeValues(editing) : emptyStore); }, [editing, reset]);

  const save = useMutation({
    mutationFn: (values: StoreInput) => saveStore(companyId, values, editing?.id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['stores', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['store-receipt-branding', companyId] }),
      ]);
      setOpen(false); setEditing(null);setMessage('Modification enregistrée');
    },
  });
  const show = (store?: Store) => { setEditing(store ?? null); setOpen(true); };
  const close = () => { setOpen(false); setEditing(null);setDiscard(false); };
  const requestClose=()=>{if(save.isPending)return;if(isDirty)setDiscard(true);else close()};

  return (
    <AdminPage title="Boutiques" action={<AppButton icon={canAddStore?'plus':'lock-outline'} onPress={() => canAddStore ? show() : router.push('/(subscription)' as never)}>{canAddStore?'Ajouter':'Forfait requis'}</AppButton>}>
      <Card mode="contained" style={{ backgroundColor: theme.colors.primaryContainer }}>
        <Card.Content style={styles.intro}>
          <Icon source="receipt-text-edit-outline" size={30} color={theme.colors.primary} />
          <View style={styles.grow}><Text variant="titleMedium" style={styles.bold}>Un reçu propre à chaque boutique</Text><Text>Ouvrez une boutique pour personnaliser son nom, son logo, ses coordonnées, sa couleur et son message de fin.</Text></View>
        </Card.Content>
      </Card>

      {stores.data?.length ? stores.data.map((store) => (
        <Card key={store.id} mode="outlined" onPress={() => show(store)}>
          <Card.Title
            title={store.name}
            subtitle={`${store.address || 'Aucune adresse'} · Reçu ${store.receipt_display_name || store.receipt_logo_url || store.receipt_footer ? 'personnalisé' : 'hérité de l’entreprise'}`}
            subtitleNumberOfLines={2}
            left={(props) => store.receipt_logo_url ? <Avatar.Image {...props} source={{ uri: store.receipt_logo_url }} /> : <Avatar.Icon {...props} icon="store-outline" style={{ backgroundColor: store.receipt_accent_color || '#084B50' }} />}
            right={() => <StatusChip style={styles.status} status={store.is_active?'active':'inactive'}/>}
          />
        </Card>
      )) : <EmptyState icon="store-plus" title="Aucune boutique" message="Ajoutez un point de vente pour affecter vos employés et personnaliser ses reçus." action={<AppButton icon="plus" onPress={()=>show()}>Ajouter une boutique</AppButton>}/>}

      <Portal><Dialog visible={open} dismissable={!isDirty&&!save.isPending} onDismiss={requestClose}>
        <Dialog.Title>{editing ? 'Modifier la boutique' : 'Nouvelle boutique'}</Dialog.Title>
        <Dialog.ScrollArea style={styles.scrollArea}><ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
          <Text variant="titleMedium" style={styles.bold}>Informations de la boutique</Text>
          <FormField control={control} name="name" label="Nom de la boutique" required autoFocus />
          <FormField control={control} name="address" label="Adresse de la boutique (facultative)" multiline />
          <Controller control={control} name="isActive" render={({ field }) => <Card mode="outlined"><Card.Title title="Boutique active" right={() => <Switch value={field.value} onValueChange={field.onChange} style={styles.switch} />} /></Card>} />

          <View style={[styles.section, { borderTopColor: theme.colors.outlineVariant }]}><Text variant="titleMedium" style={styles.bold}>Personnalisation des reçus</Text><Text style={{ color: theme.colors.onSurfaceVariant }}>Les champs vides utilisent automatiquement les informations générales de l’entreprise.</Text></View>
          <FormField control={control} name="receiptDisplayName" label="Nom affiché sur les reçus" placeholder={preview.name || 'Nom de la boutique'} />
          <FormField control={control} name="receiptLogoUrl" label="Lien du logo (https://...)" autoCapitalize="none" keyboardType="url" />
          <FormField control={control} name="receiptAddress" label="Adresse affichée sur les reçus" multiline />
          <FormField control={control} name="receiptPhone" label="Téléphone affiché" keyboardType="phone-pad" />
          <FormField control={control} name="receiptEmail" label="Email affiché" keyboardType="email-address" autoCapitalize="none" />
          <FormField control={control} name="receiptAccentColor" label="Couleur principale" placeholder="#084B50" autoCapitalize="characters" />
          <FormField control={control} name="receiptFooter" label="Message de fin du reçu" placeholder="Merci pour votre confiance." multiline />

          <Card mode="contained" style={{ backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(preview.receiptAccentColor) ? preview.receiptAccentColor : '#084B50' }}><Card.Content style={styles.preview}><Icon source="receipt-text-outline" size={28} color="#FFFFFF" /><View style={styles.grow}><Text variant="titleMedium" style={[styles.previewText, styles.bold]}>{preview.receiptDisplayName || preview.name || 'Nom de la boutique'}</Text><Text style={styles.previewText}>{preview.receiptPhone || preview.receiptEmail || 'Coordonnées héritées de l’entreprise'}</Text></View></Card.Content></Card>
          {!!save.error && <HelperText type="error" visible>{save.error.message}</HelperText>}
        </ScrollView></Dialog.ScrollArea>
        <Dialog.Actions style={styles.actions}><AppButton mode="outlined" disabled={save.isPending} onPress={requestClose}>Annuler</AppButton><AppButton icon="content-save" disabled={!isValid||!isDirty} onPress={handleSubmit((values) => save.mutate(values))} loading={save.isPending}>Enregistrer</AppButton></Dialog.Actions>
      </Dialog></Portal>
      <ConfirmDialog visible={discard} title="Abandonner les modifications ?" message="Les informations saisies ne seront pas enregistrées." destructive onCancel={()=>setDiscard(false)} onConfirm={close}/>
      <AppFeedback message={message} onDismiss={()=>setMessage('')}/>
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  actions: { flexWrap: 'wrap' }, bold: { fontWeight: '800' }, form: { gap: 8, paddingHorizontal: 24, paddingBottom: 16 },
  grow: { flex: 1, minWidth: 0 }, intro: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 12 }, previewText: { color: '#FFFFFF' },
  scrollArea: { paddingHorizontal: 0, maxHeight: 560 }, section: { borderTopWidth: 1, paddingTop: 16, marginTop: 4, gap: 4 },
  status: { marginRight: 16 }, switch: { marginRight: 12 },
});
