import { usePermissions } from '@/features/auth/usePermissions';
import { DateField } from '@/components/forms/DateField';
import { localDateValue } from '@/utils/calendar';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { Card, Chip, Dialog, HelperText, Icon, IconButton, Portal, Switch, Text, TextInput, useTheme } from 'react-native-paper';
import { Controller, useForm } from 'react-hook-form';

import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/forms/FormField';
import { SelectField } from '@/components/forms/SelectField';
import { useAuth } from '@/features/auth/AuthProvider';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import { getCustomer, getCustomerDebtSchedule, getCustomerLedger, getCustomerSales, recordCustomerEntry, saveCustomer, setCustomerDebtSchedule } from '@/features/customers/api';
import { customerSchema, type CustomerInput } from '@/schemas/customers';
import { printPaymentReceipt, sharePaymentReceipt } from '@/features/payments/receipt';
import { getCustomerLoyalty } from '@/features/loyalty/api';
import { useReceiptAction } from '@/features/payments/useReceiptAction';
import { useReceiptBranding } from '@/features/payments/branding';
import { parseDecimal } from '@/utils/number';
import { invalidateOperationalSummaries } from '@/utils/queryInvalidation';
import { AppFeedback } from '@/components/ui/AppFeedback';
import { formatDate,formatDateTime } from '@/utils/format';
import { readableError } from '@/utils/errors';

const paymentLabels: Record<string, string> = { cash: 'Espèces', card: 'Carte', mobile_money: 'Mobile Money', bank_transfer: 'Virement', mixed: 'Mixte' };

export default function CustomerDetails() {
  const can = usePermissions();
  const { id,notice } = useLocalSearchParams<{ id: string;notice?:string }>();
  const { membership } = useAuth();
  const { formatMoney } = useCurrency();
  const theme = useTheme();
  const { width, height, fontScale } = useWindowDimensions();
  const company = membership?.companyId ?? '';
  const store = membership?.storeId ?? null;
  const canWrite = can('sales.write');
  const queryClient = useQueryClient();
  const receiptAction=useReceiptAction();
  const receiptBranding=useReceiptBranding();

  const customer = useQuery({ queryKey: ['customer', id], queryFn: () => getCustomer(id!), enabled: !!id });
  const ledger = useQuery({ queryKey: ['customer-ledger', id], queryFn: () => getCustomerLedger(id!), enabled: !!id });
  const sales = useQuery({ queryKey: ['customer-sales', company, id], queryFn: () => getCustomerSales(company, id!), enabled: !!company && !!id });
  const loyalty = useQuery({ queryKey: ['customer-loyalty', id], queryFn: () => getCustomerLoyalty(id!), enabled: !!id });
  const schedule=useQuery({queryKey:['customer-debt-schedule',id],queryFn:()=>getCustomerDebtSchedule(id!),enabled:!!id});

  const [entryType, setEntryType] = useState<'credit' | 'payment'|'discount' | null>(null);
  const [entryPaymentMethod,setEntryPaymentMethod]=useState<'cash'|'mobile_money'>('cash');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [message, setMessage] = useState(notice??'');
  const [scheduleOpen,setScheduleOpen]=useState(false);
  const [scheduleRows,setScheduleRows]=useState([{dueDate:localDateValue(new Date(Date.now()+30*86400000)),amount:''}]);

  useEffect(() => { setDetailsOpen(false); }, [id]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['customer', id] }),
      queryClient.invalidateQueries({ queryKey: ['customer-ledger', id] }),
      queryClient.invalidateQueries({ queryKey: ['customers', company] }),
      queryClient.invalidateQueries({ queryKey: ['cash-transactions', company, store] }),
      invalidateOperationalSummaries(queryClient, company, store),
    ]);
  };

  const entry = useMutation({
    mutationFn: () => recordCustomerEntry({ customerId: id!, storeId: store, type: entryType!, amount, paymentMethod:entryPaymentMethod,note }),
    onSuccess: async () => {
      await refresh();
      setEntryType(null);
      setAmount('');
      setNote('');
      setMessage(entryType === 'credit' ? 'Dette enregistrée' : entryType==='discount'?'Remise enregistrée':'Paiement enregistré');
    },
  });

  const { control, handleSubmit, reset,formState:{isValid,isDirty} } = useForm<CustomerInput>({ resolver: zodResolver(customerSchema), defaultValues: { name: '', phone: '', email: '', address: '', note: '', creditLimit: '', isActive: true },mode:'onChange' });
  useEffect(() => {
    if (customer.data) reset({ name: customer.data.name, phone: customer.data.phone ?? '', email: customer.data.email ?? '', address: customer.data.address ?? '', note: customer.data.note ?? '', creditLimit: customer.data.credit_limit == null ? '' : String(customer.data.credit_limit), isActive: customer.data.is_active });
  }, [customer.data, reset]);
  const edit = useMutation({
    mutationFn: (value: CustomerInput) => saveCustomer(company, store, value, id),
    onSuccess: async () => { await refresh(); setEditing(false); setMessage('Modification enregistrée'); },
  });
  const saveSchedule=useMutation({mutationFn:()=>setCustomerDebtSchedule(id!,scheduleRows.map(row=>({dueDate:row.dueDate,amount:parseDecimal(row.amount)}))),onSuccess:async()=>{await schedule.refetch();setScheduleOpen(false);setMessage('Échéancier enregistré.')}});

  const balance = customer.data?.balance ?? 0;
  const scheduleTotal = scheduleRows.reduce((sum, row) => sum + (parseDecimal(row.amount) || 0), 0);
  const scheduleValid = scheduleRows.every(row => !!row.dueDate && Number.isFinite(parseDecimal(row.amount)) && parseDecimal(row.amount) > 0) && Math.abs(scheduleTotal - balance) <= 0.01;
  const owes = balance > 0;
  const amountValid = amount.trim().length > 0;

  return (
    <AdminPage title={customer.data?.name ?? 'Fiche client'}>
      {!!customer.error && <HelperText type="error" visible>{customer.error.message}</HelperText>}
      {!!ledger.error && <HelperText type="error" visible>Ardoise indisponible : {ledger.error.message}</HelperText>}
      {!!sales.error && <HelperText type="error" visible>Historique des achats indisponible : {sales.error.message}</HelperText>}
      {customer.data && (
        <>
          <Card testID="customer-balance-card" mode="contained" style={{ backgroundColor: owes ? theme.colors.errorContainer : theme.colors.primaryContainer }}>
            <Card.Content style={{ gap: 8 }}>
              <Text style={{ color: owes ? theme.colors.onErrorContainer : theme.colors.onPrimaryContainer }}>Montant dû</Text>
              <Text variant="displaySmall" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={{ fontWeight: '900', color: owes ? theme.colors.error : theme.colors.primary }}>{formatMoney(balance)}</Text>
              <Text style={{ color: owes ? theme.colors.onErrorContainer : theme.colors.onPrimaryContainer }}>{owes ? 'Ce client a une dette en cours.' : 'Ce client est à jour.'}</Text>
              {canWrite && <AppButton testID="customer-add-payment" style={{ marginTop: 4 }} icon="cash-check" onPress={() => setEntryType('payment')}>Encaisser un paiement</AppButton>}
            </Card.Content>
          </Card>

          <Card mode="outlined">
            <Pressable
              testID="customer-details-toggle"
              accessibilityRole="button"
              accessibilityLabel="Plus de détails"
              accessibilityState={{ expanded: detailsOpen }}
              aria-expanded={detailsOpen}
              onPress={() => setDetailsOpen(open => !open)}
              style={({ pressed }) => ({ minHeight: 52, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.65 : 1 })}
            >
              <Text variant="titleSmall" style={{ flex: 1, fontWeight: '700' }}>Plus de détails</Text>
              <Icon source={detailsOpen ? 'chevron-up' : 'chevron-down'} size={24} color={theme.colors.onSurfaceVariant} />
            </Pressable>
            {detailsOpen && <Card.Content testID="customer-secondary-details" style={{ gap: 16 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
                <View style={{ flexGrow: 1, flexBasis: 220, gap: 4 }}>
                  <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant }}>Fidélité</Text>
                  <Text style={{ fontWeight: '700' }}>{loyalty.data?.points ?? 0} point(s) fidélité</Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{loyalty.data?.lifetime_earned ?? 0} point(s) gagnés au total</Text>
                </View>
                <View style={{ flexGrow: 1, flexBasis: 220, gap: 4 }}>
                  <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant }}>Limite de crédit</Text>
                  <Text>{customer.data.credit_limit == null ? 'Illimitée' : formatMoney(Number(customer.data.credit_limit))}</Text>
                </View>
              </View>
              {(customer.data.phone || customer.data.email || customer.data.address || customer.data.note) && <View style={{ gap: 8 }}>
                <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant }}>Coordonnées et note</Text>
                {!!customer.data.phone && <Text>Téléphone : {customer.data.phone}</Text>}
                {!!customer.data.email && <Text>Email : {customer.data.email}</Text>}
                {!!customer.data.address && <Text>Adresse : {customer.data.address}</Text>}
                {!!customer.data.note && <Text style={{ color: theme.colors.onSurfaceVariant }}>{customer.data.note}</Text>}
              </View>}
              {canWrite && <AppButton mode="outlined" icon="pencil" onPress={() => setEditing(true)}>Modifier la fiche</AppButton>}
            </Card.Content>}
          </Card>

          {schedule.data&&<Card mode="outlined"><Card.Title title="Échéancier actif" subtitle={`${schedule.data.customer_debt_installments.length} échéance(s)`}/><Card.Content style={{gap:6}}>{schedule.data.customer_debt_installments.map(row=><Text key={row.id}>{formatDate(row.due_date)} • {formatMoney(Number(row.amount)-Number(row.paid_amount))} restant • {row.status}</Text>)}</Card.Content></Card>}
          {membership?.role==='company_admin'&&balance>0&&<AppButton mode="outlined" icon="calendar-clock" onPress={()=>setScheduleOpen(true)}>Définir l’échéancier</AppButton>}

          {canWrite && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              <AppButton testID="customer-add-credit" style={{ flexGrow: 1, flexBasis: 200 }} mode="outlined" icon="notebook-plus-outline" onPress={() => setEntryType('credit')}>Ajouter une dette</AppButton>
              {membership?.role==='company_admin'&&<AppButton style={{ flexGrow: 1, flexBasis: 200 }} mode="outlined" icon="sale" onPress={() => setEntryType('discount')}>Remise sur dette</AppButton>}
            </View>
          )}

          <Text variant="titleLarge" style={{ fontWeight: '800' }}>Historique d’achat</Text>
          {(sales.data ?? []).map((sale) => (
            <Card key={sale.id} mode="outlined"><Card.Title title={sale.reference ?? 'Vente'} subtitle={`${sale.store?.name ?? 'Boutique'} • ${paymentLabels[sale.payment_method ?? ''] ?? sale.payment_method ?? 'Paiement'} • ${formatDate(sale.created_at)}`} right={() => <Text variant="titleMedium" style={{ marginRight: 16 }}>{formatMoney(Number(sale.total))}</Text>} /></Card>
          ))}
          {!sales.isLoading && !(sales.data ?? []).length && <EmptyState icon="cart-outline" title="Aucun achat" message="Ce client n’a pas encore d’achat enregistré." />}

          <Text variant="titleLarge" style={{ fontWeight: '800' }}>Mouvements de l’ardoise</Text>
          {(ledger.data ?? []).map((row) => {
            const credit = row.entry_type === 'credit';const discount=row.entry_type==='discount';
            return (
              <Card key={row.id} mode="contained" style={{ backgroundColor: theme.colors.surface }}>
                <Card.Content style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: credit ? theme.colors.errorContainer : theme.colors.primaryContainer }}>
                    <Icon source={credit ? 'notebook-plus-outline' : discount?'sale':'cash-check'} size={22} color={credit ? theme.colors.error : theme.colors.primary} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontWeight: '700' }}>{credit ? 'Dette' : discount?'Remise de dette':`Paiement${row.payment_method==='mobile_money'?' Mobile Money':' espèces'}`}</Text>
                    <Text style={{ color: theme.colors.onSurfaceVariant }}>{row.note ?? formatDateTime(row.created_at)}</Text>
                  </View>
                  <Text variant="titleMedium" style={{ fontWeight: '800', color: credit ? theme.colors.error : theme.colors.primary }}>{credit ? '+' : '−'}{formatMoney(Number(row.amount))}</Text>
                </Card.Content>
                {row.entry_type==='payment'&&<Card.Actions>{(()=>{const data={...receiptBranding,title:'Reçu de paiement client',party:customer.data!.name,amount:Number(row.amount),balanceBefore:Number(row.balance_before??0),balanceAfter:Number(row.balance_after??0),date:row.created_at,reference:`CLIENT-${row.id.slice(0,8).toUpperCase()}`,note:row.note,issuedBy:row.creator?.full_name||receiptBranding.issuedBy};const printKey=`print-${row.id}`,shareKey=`share-${row.id}`;return [<AppButton key={printKey} mode="text" icon="printer" loading={receiptAction.runningKey===printKey} disabled={!!receiptAction.runningKey} onPress={()=>void receiptAction.run(printKey,()=>printPaymentReceipt(data,formatMoney))}>Imprimer</AppButton>,<AppButton key={shareKey} mode="text" icon="share-variant" loading={receiptAction.runningKey===shareKey} disabled={!!receiptAction.runningKey} onPress={()=>void receiptAction.run(shareKey,()=>sharePaymentReceipt(data,formatMoney))}>Partager</AppButton>]})()}</Card.Actions>}
              </Card>
            );
          })}
          {!ledger.isLoading && !(ledger.data ?? []).length && <Chip icon="information-outline">Aucun mouvement d’ardoise.</Chip>}
        </>
      )}

      <Portal>
        <Dialog visible={!!entryType} dismissable={!entry.isPending&&!amount&&!note} onDismiss={() => !entry.isPending&&!amount&&!note&&setEntryType(null)}>
          <Dialog.Title>{entryType === 'credit' ? 'Ajouter une dette' : entryType==='discount'?'Accorder une remise sur dette':'Encaisser un paiement'}</Dialog.Title>
          <Dialog.ScrollArea style={{ paddingHorizontal: 0 }}><ScrollView nestedScrollEnabled contentContainerStyle={{ gap: 12, paddingHorizontal: 24, paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
            <TextInput testID="customer-entry-amount" mode="outlined" label="Montant *" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" left={<TextInput.Icon icon="cash" />} autoFocus />
            {entryType==='payment'&&<SelectField
              label="Moyen de paiement"
              value={entryPaymentMethod}
              onChange={value=>setEntryPaymentMethod((value??'cash') as 'cash'|'mobile_money')}
              options={[{label:'Espèces',value:'cash'},{label:'Mobile Money',value:'mobile_money'}]}
            />}
            <TextInput mode="outlined" label={entryType==='discount'?'Motif obligatoire':'Note (facultatif)'} value={note} onChangeText={setNote} />
            {!!entry.error && <HelperText type="error" visible>{readableError(entry.error)}</HelperText>}
          </ScrollView></Dialog.ScrollArea>
          <Dialog.Actions style={{ flexWrap: 'wrap' }}>
            <AppButton mode="outlined" disabled={entry.isPending} onPress={() => {setEntryType(null);setAmount('');setNote('')}}>Annuler</AppButton>
            <AppButton testID="customer-entry-confirm" loading={entry.isPending} disabled={!amountValid || (entryType==='discount'&&note.trim().length<3)} destructive={entryType==='credit'} onPress={() => entry.mutate()}>Enregistrer</AppButton>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={editing} dismissable={!edit.isPending&&!isDirty} onDismiss={() => !edit.isPending&&!isDirty&&setEditing(false)}>
          <Dialog.Title>Modifier la fiche</Dialog.Title>
          <Dialog.ScrollArea style={{ paddingHorizontal: 0 }}><ScrollView nestedScrollEnabled contentContainerStyle={{ gap: 12, paddingHorizontal: 24, paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
            <FormField control={control} name="name" label="Nom du client" required autoFocus />
            <FormField control={control} name="phone" label="Téléphone" keyboardType="phone-pad" />
            <FormField control={control} name="email" label="Email" autoCapitalize="none" keyboardType="email-address" />
            <FormField control={control} name="address" label="Adresse" />
            <FormField control={control} name="note" label="Note" multiline />
            <FormField control={control} name="creditLimit" label="Limite de crédit (vide = illimitée)" keyboardType="decimal-pad" />
            <Controller control={control} name="isActive" render={({ field }) => <Card mode="outlined"><Card.Title title="Client actif" right={() => <Switch value={field.value} onValueChange={field.onChange} style={{ marginRight: 12 }} />} /></Card>} />
            {!!edit.error && <HelperText type="error" visible>{readableError(edit.error)}</HelperText>}
          </ScrollView></Dialog.ScrollArea>
          <Dialog.Actions style={{ flexWrap: 'wrap' }}>
            <AppButton mode="outlined" disabled={edit.isPending} onPress={() => {setEditing(false);if(customer.data)reset({name:customer.data.name,phone:customer.data.phone??'',email:customer.data.email??'',address:customer.data.address??'',note:customer.data.note??'',creditLimit:customer.data.credit_limit==null?'':String(customer.data.credit_limit),isActive:customer.data.is_active})}}>Annuler</AppButton>
            <AppButton loading={edit.isPending} disabled={!isValid||!isDirty} onPress={handleSubmit((value) => edit.mutate(value))}>Enregistrer</AppButton>
          </Dialog.Actions>
        </Dialog>
        <Dialog testID="debt-schedule-dialog" visible={scheduleOpen} dismissable={!saveSchedule.isPending} onDismiss={()=>!saveSchedule.isPending&&setScheduleOpen(false)} style={{ width: Math.min(480, width - 32), maxHeight: height - 32, alignSelf: 'center', marginHorizontal: 0 }}>
          <Dialog.Title style={{ marginTop: 16, marginBottom: 12, marginHorizontal: 16, fontSize: 20 }}>Échéancier de la dette</Dialog.Title>
          <Dialog.ScrollArea style={{ paddingHorizontal: 0 }}>
            <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: height * 0.5 }} contentContainerStyle={{ gap: 10, paddingHorizontal: 16, paddingVertical: 12 }}>
              {scheduleRows.map((row, index) => <View key={index} style={{ gap: 6, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.outlineVariant }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text variant="labelLarge">Échéance {index + 1}</Text>
                  {scheduleRows.length > 1 && <IconButton icon="close" accessibilityLabel={`Retirer l’échéance ${index + 1}`} size={20} style={{ margin: 0, width: 44, height: 44 }} disabled={saveSchedule.isPending} onPress={() => setScheduleRows(rows => rows.filter((_, i) => i !== index))} />}
                </View>
                <View style={{ flexDirection: width >= 460 && fontScale <= 1.2 ? 'row' : 'column', alignItems: 'stretch', gap: 8 }}>
                  <View style={{ flex: 1, minWidth: 0 }}><DateField label={`Date de l’échéance ${index + 1}`} value={row.dueDate} disabled={saveSchedule.isPending} onChange={dueDate => setScheduleRows(rows => rows.map((item, i) => i === index ? { ...item, dueDate } : item))} /></View>
                  <TextInput mode="outlined" dense label="Montant" accessibilityLabel={`Montant de l’échéance ${index + 1}`} keyboardType="decimal-pad" style={{ flex: 1, minWidth: 0 }} value={row.amount} disabled={saveSchedule.isPending} onChangeText={amount => setScheduleRows(rows => rows.map((item, i) => i === index ? { ...item, amount } : item))} />
                </View>
              </View>)}
              <AppButton mode="text" icon="plus" disabled={saveSchedule.isPending} onPress={() => setScheduleRows(rows => [...rows, { dueDate: localDateValue(new Date(Date.now() + (rows.length + 1) * 30 * 86400000)), amount: '' }])}>Ajouter une échéance</AppButton>
              <Text variant="bodySmall">Total requis : {formatMoney(balance)} · Saisi : {formatMoney(scheduleTotal)}</Text>
              {!!saveSchedule.error && <HelperText type="error" visible>{readableError(saveSchedule.error)}</HelperText>}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions style={{ flexWrap: 'wrap', padding: 8 }}><AppButton mode="text" disabled={saveSchedule.isPending} onPress={()=>setScheduleOpen(false)}>Fermer</AppButton><AppButton loading={saveSchedule.isPending} disabled={saveSchedule.isPending || !scheduleValid} onPress={()=>saveSchedule.mutate()}>Enregistrer</AppButton></Dialog.Actions>
        </Dialog>
      </Portal>
      <AppFeedback message={message} onDismiss={() => setMessage('')}/>
      <AppFeedback message={receiptAction.error??''} type="error" onDismiss={receiptAction.clearError}/>
    </AdminPage>
  );
}
