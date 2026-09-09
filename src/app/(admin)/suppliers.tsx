import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Card, Chip, Dialog, HelperText, IconButton, Menu, Portal, Switch, Text, TextInput, useTheme } from 'react-native-paper';
import { FormField } from '@/components/forms/FormField';
import { SelectField } from '@/components/forms/SelectField';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { AppFeedback } from '@/components/ui/AppFeedback';
import { readableError } from '@/utils/errors';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppSearchBar } from '@/components/ui/AppSearchBar';
import { useAuth } from '@/features/auth/AuthProvider';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import { cancelPurchase, getSupplierAccount, recordSupplierPayment, type SupplierPayment } from '@/features/operations/api';
import { getSuppliers, getSupplierStats, saveSupplier } from '@/features/products/api';
import { supplierSchema, type SupplierInput } from '@/schemas/catalog';
import type { Supplier } from '@/types/database';
import { parseDecimal } from '@/utils/number';
import { printPaymentReceipt, sharePaymentReceipt } from '@/features/payments/receipt';
import { useReceiptAction } from '@/features/payments/useReceiptAction';
import { useReceiptBranding } from '@/features/payments/branding';
import { invalidateOperationalSummaries } from '@/utils/queryInvalidation';
import { formatDate, formatDateTime } from '@/utils/format';
import { StatusChip } from '@/components/ui/StatusChip';

const paymentLabels: Record<SupplierPayment['payment_method'], string> = {
  cash: 'Espèces',
  mobile_money: 'Mobile Money',
  card: 'Carte',
  bank_transfer: 'Virement',
};

export default function Suppliers() {
  const { membership } = useAuth();
  const { formatMoney } = useCurrency();
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const company = membership?.companyId ?? '';
  const store = membership?.storeId ?? '';
  const cache = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [selected, setSelected] = useState<Supplier | null>(null);
  const [menuSupplierId, setMenuSupplierId] = useState<string | null>(null);
  const [contactSupplier, setContactSupplier] = useState<Supplier | null>(null);
  const [search, setSearch] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<SupplierPayment['payment_method']>('cash');
  const [paymentMode,setPaymentMode]=useState<'total'|'custom'>('total');
  const [purchaseToCancel,setPurchaseToCancel]=useState<string|null>(null);
  const [cancellationReason,setCancellationReason]=useState('');
  const [cancellationMethod,setCancellationMethod]=useState<'cash'|'mobile_money'>('cash');
  const receiptAction=useReceiptAction();
  const receiptBranding=useReceiptBranding();

  const query = useQuery({ queryKey: ['suppliers', company, store], queryFn: () => getSuppliers(company, store), enabled: !!company && !!store });
  const stats = useQuery({ queryKey: ['supplier-stats', company, store], queryFn: () => getSupplierStats(company, store), enabled: !!company && !!store });
  const account = useQuery({
    queryKey: ['supplier-account', company, store, selected?.id],
    queryFn: () => getSupplierAccount(company, store, selected!.id),
    enabled: !!company && !!store && !!selected,
  });
  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (query.data ?? []).filter((item) => !term || `${item.name} ${item.email ?? ''} ${item.phone ?? ''}`.toLowerCase().includes(term));
  }, [query.data, search]);

  const { control, handleSubmit, reset, formState: { isDirty, isValid } } = useForm<SupplierInput>({
    resolver: zodResolver(supplierSchema),
    defaultValues: { name: '', email: '', phone: '', address: '', isActive: true },
    mode: 'onChange',
  });
  useEffect(() => reset(editing
    ? { name: editing.name, email: editing.email ?? '', phone: editing.phone ?? '', address: editing.address ?? '', isActive: editing.is_active }
    : { name: '', email: '', phone: '', address: '', isActive: true }), [editing, reset]);

  const mutation = useMutation({
    mutationFn: (value: SupplierInput) => saveSupplier(company, store, value, editing?.id),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['suppliers', company, store] });
      setOpen(false);
      setEditing(null);
    },
  });
  const paymentMutation = useMutation({
    mutationFn: () => recordSupplierPayment({ storeId: store, supplierId: selected!.id, amount: paymentMode==='total'?Number(account.data?.due??0):parseDecimal(amount), paymentMethod, note }),
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['supplier-account', company, store, selected?.id] }),
        cache.invalidateQueries({ queryKey: ['supplier-stats', company, store] }),
        cache.invalidateQueries({ queryKey: ['cash-transactions', company, store] }),
        cache.invalidateQueries({ queryKey: ['cash-summary', company, store] }),
        invalidateOperationalSummaries(cache, company, store),
      ]);
      setAmount('');
      setNote('');
      setSelected(null);
    },
  });
  const cancellationMutation=useMutation({mutationFn:()=>cancelPurchase(purchaseToCancel!,cancellationReason,cancellationMethod),onSuccess:async()=>{await Promise.all([cache.invalidateQueries({queryKey:['supplier-account',company,store,selected?.id]}),cache.invalidateQueries({queryKey:['supplier-stats',company,store]}),cache.invalidateQueries({queryKey:['stock-levels',company]}),cache.invalidateQueries({queryKey:['cash-summary',company,store]})]);setPurchaseToCancel(null);setCancellationReason('')}});

  const show = (item?: Supplier) => {
    mutation.reset();
    setEditing(item ?? null);
    setOpen(true);
  };
  const showPayment = (item: Supplier) => {
    paymentMutation.reset();
    setAmount('');
    setNote('');
    setPaymentMethod('cash');
    setPaymentMode('total');
    setSelected(item);
  };
  const parsedAmount = parseDecimal(amount);

  return <AdminPage title="Fournisseurs" action={<AppButton icon="plus" accessibilityLabel="Ajouter un fournisseur" onPress={() => show()}>Ajouter</AppButton>}>
    <AppSearchBar placeholder="Nom, email ou téléphone" value={search} onChangeText={setSearch} />
    {!!query.error && <HelperText type="error" visible>{query.error.message}</HelperText>}
    {!!stats.error && <HelperText type="error" visible>{stats.error.message}</HelperText>}
    {shown.map((item) => {
      const summary = stats.data?.[item.id];
      const due = summary?.due ?? 0;
      return <Card key={item.id} mode="outlined">
        <Card.Content style={styles.supplierContent}>
          <View style={styles.supplierHeader}>
            <Text variant="titleMedium" style={styles.supplierName}>{item.name}</Text>
            <StatusChip status={item.is_active ? 'active' : 'archived'} />
          </View>
          <Text style={{ color: theme.colors.onSurfaceVariant }}>
            <Text style={[styles.debt, { color: due > 0 ? theme.colors.error : theme.colors.onSurface }]}>Dette : {formatMoney(due)}</Text>
            {' · '}Achats : {formatMoney(summary?.total ?? 0)}{' · '}{summary?.count ?? 0} livraison{summary?.count === 1 ? '' : 's'}
          </Text>
          <View style={styles.supplierActions}>
            <AppButton mode="text" icon="file-document-outline" onPress={() => showPayment(item)}>Compte / Reçus</AppButton>
            <Menu
              visible={menuSupplierId === item.id}
              onDismiss={() => setMenuSupplierId(null)}
              theme={{ animation: { scale: 0 } }}
              contentStyle={{ maxWidth: Math.min(280, width - 32) }}
              anchor={<IconButton icon="dots-horizontal" size={24} style={styles.menuButton} accessibilityLabel={`Actions pour ${item.name}`} onPress={() => setMenuSupplierId(item.id)} />}
            >
              <Menu.Item leadingIcon="pencil-outline" title="Modifier" onPress={() => { setMenuSupplierId(null); show(item); }} />
              <Menu.Item leadingIcon="card-account-details-outline" title="Coordonnées et détails" onPress={() => { setMenuSupplierId(null); setContactSupplier(item); }} />
            </Menu>
          </View>
        </Card.Content>
      </Card>;
    })}
    <AppButton icon="truck-check-outline" onPress={() => router.push('/purchases' as never)}>Nouvel approvisionnement</AppButton>
    {!query.isLoading && !shown.length && <EmptyState icon={search ? 'magnify' : 'truck-plus'} title={search ? 'Aucun résultat' : 'Aucun fournisseur'} message={search ? 'Modifiez votre recherche.' : 'Ajoutez votre premier fournisseur.'} />}
    <Portal>
      <Dialog visible={!!contactSupplier} onDismiss={() => setContactSupplier(null)} style={[styles.contactDialog, { width: Math.min(440, width - 32) }]}>
        <Dialog.Title>{contactSupplier?.name}</Dialog.Title>
        <Dialog.ScrollArea>
          <ScrollView style={{ maxHeight: Math.max(80, height * 0.45) }} contentContainerStyle={styles.contactDetails}>
            <Text>Email : {contactSupplier?.email || 'Non renseigné'}</Text>
            <Text>Téléphone : {contactSupplier?.phone || 'Non renseigné'}</Text>
            <Text>Adresse : {contactSupplier?.address || 'Non renseignée'}</Text>
            {!!contactSupplier && !!stats.data?.[contactSupplier.id]?.lastDelivery && <Text>Dernière livraison : {formatDate(stats.data[contactSupplier.id].lastDelivery!)}</Text>}
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions><AppButton mode="text" onPress={() => setContactSupplier(null)}>Fermer</AppButton></Dialog.Actions>
      </Dialog>
      <Dialog visible={open} dismissable={!isDirty&&!mutation.isPending} onDismiss={() => !isDirty&&!mutation.isPending&&setOpen(false)}>
        <Dialog.Title>{editing ? 'Modifier le fournisseur' : 'Nouveau fournisseur'}</Dialog.Title>
        <Dialog.ScrollArea style={{ paddingHorizontal: 0 }}><ScrollView nestedScrollEnabled contentContainerStyle={{ gap: 12, paddingHorizontal: 24, paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
          <FormField control={control} name="name" label="Nom" />
          <FormField control={control} name="email" label="Email" keyboardType="email-address" autoCapitalize="none" />
          <FormField control={control} name="phone" label="Téléphone" keyboardType="phone-pad" />
          <FormField control={control} name="address" label="Adresse" multiline />
          <Controller control={control} name="isActive" render={({ field }) => <Card mode="outlined"><Card.Title title="Fournisseur actif" right={() => <Switch value={field.value} onValueChange={field.onChange} style={{ marginRight: 12 }} />} /></Card>} />
          {!!mutation.error && <HelperText type="error" visible>{mutation.error.message}</HelperText>}
        </ScrollView></Dialog.ScrollArea>
        <Dialog.Actions style={{ flexWrap: 'wrap' }}><AppButton mode="text" disabled={mutation.isPending} onPress={() => setOpen(false)}>Annuler</AppButton><AppButton loading={mutation.isPending} disabled={!isValid||!isDirty||mutation.isPending} onPress={handleSubmit((value) => mutation.mutate(value))}>Enregistrer</AppButton></Dialog.Actions>
      </Dialog>

      <Dialog visible={!!selected} onDismiss={() => setSelected(null)}>
        <Dialog.Title>Régler {selected?.name}</Dialog.Title>
        <Dialog.ScrollArea style={{ paddingHorizontal: 0 }}><ScrollView nestedScrollEnabled contentContainerStyle={{ gap: 12, paddingHorizontal: 24, paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
          {!!account.error && <HelperText type="error" visible>{account.error.message}</HelperText>}
          <Card mode="contained"><Card.Title title={`Dette restante : ${formatMoney(account.data?.due ?? 0)}`} subtitle={`Déjà payé : ${formatMoney(account.data?.paid ?? 0)} • Achats : ${formatMoney(account.data?.total ?? 0)}`} /></Card>
          <Text variant="titleSmall">Type de règlement</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8}}><Chip icon="check-all" selected={paymentMode==='total'} onPress={()=>{setPaymentMode('total');setAmount(String(account.data?.due??''));}}>Paiement total</Chip><Chip icon="pencil-outline" selected={paymentMode==='custom'} onPress={()=>{setPaymentMode('custom');setAmount('');}}>Montant personnalisé</Chip></ScrollView>
          {paymentMode==='total'?<Card mode="outlined"><Card.Title title={formatMoney(account.data?.due??0)} subtitle="La totalité de la dette sera réglée"/></Card>:<TextInput mode="outlined" label="Montant personnalisé" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />}
          <Text variant="titleSmall">Moyen de paiement</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {(Object.keys(paymentLabels) as SupplierPayment['payment_method'][]).map((method) => <Chip key={method} selected={paymentMethod === method} onPress={() => setPaymentMethod(method)}>{paymentLabels[method]}</Chip>)}
          </ScrollView>
          <TextInput mode="outlined" label="Note (facultative)" value={note} onChangeText={setNote} multiline />
          {!!paymentMutation.error && <HelperText type="error" visible>{paymentMutation.error.message}</HelperText>}
          <Text variant="titleMedium">Achats non soldés</Text>
          {(account.data?.purchases ?? []).map((row) => <Card key={row.id} mode="outlined"><Card.Title title={formatMoney(Number(row.total))} subtitle={`${row.payment_status==='cancelled'?'Annulé':row.payment_status === 'partial' ? 'Paiement partiel' : row.payment_status==='paid'?'Payé':'À payer'} • ${formatDate(row.created_at)}`} />{row.cancellation_reason&&<Card.Content><Text>Motif : {row.cancellation_reason}</Text></Card.Content>}{row.payment_status!=='cancelled'&&membership?.role==='company_admin'&&<Card.Actions><AppButton mode="text" destructive icon="cancel" onPress={()=>setPurchaseToCancel(row.id)}>Annuler l’achat</AppButton></Card.Actions>}</Card>)}
          {!(account.data?.purchases ?? []).some((row) => Number(row.amount_due) > 0) && !account.isLoading && <Text>Aucune dette fournisseur.</Text>}
          <Text variant="titleMedium">Historique des règlements</Text>
          {(account.data?.payments ?? []).map((row) => {const receipt={...receiptBranding,title:'Reçu de paiement fournisseur',party:selected?.name??'Fournisseur',amount:Number(row.amount),balanceBefore:Number(row.balance_before??0),balanceAfter:Number(row.balance_after??0),date:row.created_at,reference:`FOURN-${row.id.slice(0,8).toUpperCase()}`,note:row.note,issuedBy:row.creator?.full_name||receiptBranding.issuedBy};const printKey=`print-${row.id}`,shareKey=`share-${row.id}`;return <Card key={row.id} mode="outlined"><Card.Title title={formatMoney(Number(row.amount))} subtitle={`${paymentLabels[row.payment_method]} • ${formatDateTime(row.created_at)}`} />{!!row.note && <Card.Content><Text>{row.note}</Text></Card.Content>}<Card.Actions><AppButton mode="text" icon="printer" loading={receiptAction.runningKey===printKey} disabled={!!receiptAction.runningKey} onPress={()=>void receiptAction.run(printKey,()=>printPaymentReceipt(receipt,formatMoney))}>Imprimer</AppButton><AppButton mode="text" icon="share-variant" loading={receiptAction.runningKey===shareKey} disabled={!!receiptAction.runningKey} onPress={()=>void receiptAction.run(shareKey,()=>sharePaymentReceipt(receipt,formatMoney))}>Partager</AppButton></Card.Actions></Card>})}
          {!account.data?.payments.length && !account.isLoading && <Text>Aucun règlement enregistré.</Text>}
        </ScrollView></Dialog.ScrollArea>
        <Dialog.Actions style={{ flexWrap: 'wrap' }}><AppButton mode="text" onPress={() => setSelected(null)}>Fermer</AppButton><AppButton icon="cash-check" loading={paymentMutation.isPending} disabled={paymentMutation.isPending || account.isLoading || !((paymentMode==='total'?(account.data?.due??0):parsedAmount)>0) || (paymentMode==='custom'&&parsedAmount > (account.data?.due ?? 0))} onPress={() => paymentMutation.mutate()}>Enregistrer</AppButton></Dialog.Actions>
      </Dialog>

      <Dialog visible={!!purchaseToCancel} onDismiss={()=>!cancellationMutation.isPending&&setPurchaseToCancel(null)}>
        <Dialog.Title>Annuler cet achat fournisseur ?</Dialog.Title>
        <Dialog.Content style={{gap:12}}><Text>Le stock reçu sera retiré. Si des unités ont déjà été vendues ou transférées, l’annulation sera refusée.</Text><TextInput mode="outlined" label="Motif obligatoire" value={cancellationReason} onChangeText={setCancellationReason} multiline/><SelectField label="Remboursement du montant payé" value={cancellationMethod} onChange={value=>setCancellationMethod((value??'cash') as 'cash'|'mobile_money')} options={[{label:'Espèces',value:'cash'},{label:'Mobile Money',value:'mobile_money'}]}/>{!!cancellationMutation.error&&<HelperText type="error" visible>{cancellationMutation.error.message}</HelperText>}</Dialog.Content>
        <Dialog.Actions style={{ flexWrap: 'wrap' }}><AppButton mode="text" onPress={()=>setPurchaseToCancel(null)}>Fermer</AppButton><AppButton buttonColor="#C92A2A" loading={cancellationMutation.isPending} disabled={cancellationReason.trim().length<3||cancellationMutation.isPending} onPress={()=>cancellationMutation.mutate()}>Confirmer l’annulation</AppButton></Dialog.Actions>
      </Dialog>
    </Portal>
    <AppFeedback message={receiptAction.error ? readableError(receiptAction.error) : ''} type="error" onDismiss={receiptAction.clearError} />
  </AdminPage>;
}

const styles = StyleSheet.create({
  supplierContent: { gap: 6, paddingTop: 12, paddingBottom: 8 },
  supplierHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  supplierName: { flexGrow: 1, flexShrink: 1, flexBasis: 160, minWidth: 0, fontWeight: '800' },
  debt: { fontWeight: '800' },
  supplierActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  menuButton: { margin: 0, width: 44, height: 44 },
  contactDialog: { alignSelf: 'center', marginHorizontal: 0 },
  contactDetails: { gap: 12, paddingVertical: 12 },
});
