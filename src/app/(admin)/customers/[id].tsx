import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Card, Chip, Dialog, HelperText, Icon, Portal, Snackbar, Switch, Text, TextInput, useTheme } from 'react-native-paper';
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
import { parseDecimal } from '@/utils/number';

const paymentLabels: Record<string, string> = { cash: 'Espèces', card: 'Carte', mobile_money: 'Mobile Money', bank_transfer: 'Virement', mixed: 'Mixte' };

export default function CustomerDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { membership } = useAuth();
  const { formatMoney } = useCurrency();
  const theme = useTheme();
  const company = membership?.companyId ?? '';
  const store = membership?.storeId ?? null;
  const canWrite = membership?.role === 'company_admin' || !!membership?.permissions.includes('sales.write');
  const queryClient = useQueryClient();
  const receiptAction=useReceiptAction();

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
  const [message, setMessage] = useState('');
  const [scheduleOpen,setScheduleOpen]=useState(false);
  const [scheduleRows,setScheduleRows]=useState([{dueDate:new Date(Date.now()+30*86400000).toISOString().slice(0,10),amount:''}]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['customer', id] }),
      queryClient.invalidateQueries({ queryKey: ['customer-ledger', id] }),
      queryClient.invalidateQueries({ queryKey: ['customers', company] }),
    ]);
  };

  const entry = useMutation({
    mutationFn: () => recordCustomerEntry({ customerId: id!, storeId: store, type: entryType!, amount, paymentMethod:entryPaymentMethod,note }),
    onSuccess: async () => {
      await refresh();
      setEntryType(null);
      setAmount('');
      setNote('');
      setMessage(entryType === 'credit' ? 'Dette ajoutée à l’ardoise.' : entryType==='discount'?'Remise de dette enregistrée et auditée.':'Paiement enregistré et ajouté à la caisse.');
    },
  });

  const { control, handleSubmit, reset } = useForm<CustomerInput>({ resolver: zodResolver(customerSchema), defaultValues: { name: '', phone: '', email: '', address: '', note: '', creditLimit: '', isActive: true } });
  useEffect(() => {
    if (customer.data) reset({ name: customer.data.name, phone: customer.data.phone ?? '', email: customer.data.email ?? '', address: customer.data.address ?? '', note: customer.data.note ?? '', creditLimit: customer.data.credit_limit == null ? '' : String(customer.data.credit_limit), isActive: customer.data.is_active });
  }, [customer.data, reset]);
  const edit = useMutation({
    mutationFn: (value: CustomerInput) => saveCustomer(company, store, value, id),
    onSuccess: async () => { await refresh(); setEditing(false); setMessage('Fiche client mise à jour.'); },
  });
  const saveSchedule=useMutation({mutationFn:()=>setCustomerDebtSchedule(id!,scheduleRows.map(row=>({dueDate:row.dueDate,amount:parseDecimal(row.amount)}))),onSuccess:async()=>{await schedule.refetch();setScheduleOpen(false);setMessage('Échéancier enregistré.')}});

  const balance = customer.data?.balance ?? 0;
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
            <Card.Content style={{ gap: 6 }}>
              <Text style={{ color: owes ? theme.colors.onErrorContainer : theme.colors.onPrimaryContainer }}>Ardoise (solde dû)</Text>
              <Text variant="displaySmall" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={{ fontWeight: '900', color: owes ? theme.colors.error : theme.colors.primary }}>{formatMoney(balance)}</Text>
              <Text style={{ color: owes ? theme.colors.onErrorContainer : theme.colors.onPrimaryContainer }}>{owes ? 'Ce client a une dette en cours.' : 'Ce client est à jour.'}</Text>
              <Text style={{ color: owes ? theme.colors.onErrorContainer : theme.colors.onPrimaryContainer }}>Limite de crédit : {customer.data.credit_limit == null ? 'Illimitée' : formatMoney(Number(customer.data.credit_limit))}</Text>
            </Card.Content>
          </Card>
          <Card mode="contained" style={{ backgroundColor: theme.colors.secondaryContainer }}><Card.Title title={`${loyalty.data?.points ?? 0} point(s) fidélité`} subtitle={`${loyalty.data?.lifetime_earned ?? 0} point(s) gagnés au total`} left={()=><Icon source="star-circle" size={34} color={theme.colors.secondary}/>} /></Card>
          {schedule.data&&<Card mode="outlined"><Card.Title title="Échéancier actif" subtitle={`${schedule.data.customer_debt_installments.length} échéance(s)`}/><Card.Content style={{gap:6}}>{schedule.data.customer_debt_installments.map(row=><Text key={row.id}>{new Date(row.due_date).toLocaleDateString('fr-CA')} • {formatMoney(Number(row.amount)-Number(row.paid_amount))} restant • {row.status}</Text>)}</Card.Content></Card>}
          {membership?.role==='company_admin'&&balance>0&&<AppButton mode="outlined" icon="calendar-clock" onPress={()=>setScheduleOpen(true)}>Définir l’échéancier</AppButton>}

          {(customer.data.phone || customer.data.email || customer.data.address || customer.data.note) && (
            <Card mode="outlined"><Card.Content style={{ gap: 4 }}>
              {!!customer.data.phone && <Text>📞 {customer.data.phone}</Text>}
              {!!customer.data.email && <Text>✉️ {customer.data.email}</Text>}
              {!!customer.data.address && <Text>📍 {customer.data.address}</Text>}
              {!!customer.data.note && <Text style={{ color: theme.colors.onSurfaceVariant }}>{customer.data.note}</Text>}
            </Card.Content></Card>
          )}

          {canWrite && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              <AppButton testID="customer-add-credit" style={{ flexGrow: 1, flexBasis: 200 }} icon="notebook-plus-outline" buttonColor={theme.colors.error} onPress={() => setEntryType('credit')}>Ajouter une dette</AppButton>
              <AppButton testID="customer-add-payment" style={{ flexGrow: 1, flexBasis: 200 }} icon="cash-check" onPress={() => setEntryType('payment')}>Encaisser un paiement</AppButton>
              {membership?.role==='company_admin'&&<AppButton style={{ flexGrow: 1, flexBasis: 200 }} mode="outlined" icon="sale" onPress={() => setEntryType('discount')}>Remise sur dette</AppButton>}
            </View>
          )}
          {canWrite && <AppButton mode="outlined" icon="pencil" onPress={() => setEditing(true)}>Modifier la fiche</AppButton>}

          <Text variant="titleLarge" style={{ fontWeight: '800' }}>Historique d’achat</Text>
          {(sales.data ?? []).map((sale) => (
            <Card key={sale.id} mode="outlined"><Card.Title title={sale.reference ?? 'Vente'} subtitle={`${sale.store?.name ?? 'Boutique'} • ${paymentLabels[sale.payment_method ?? ''] ?? sale.payment_method ?? 'Paiement'} • ${new Date(sale.created_at).toLocaleDateString('fr-CA')}`} right={() => <Text variant="titleMedium" style={{ marginRight: 16 }}>{formatMoney(Number(sale.total))}</Text>} /></Card>
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
                    <Text style={{ color: theme.colors.onSurfaceVariant }}>{row.note ?? new Date(row.created_at).toLocaleString('fr-CA')}</Text>
                  </View>
                  <Text variant="titleMedium" style={{ fontWeight: '800', color: credit ? theme.colors.error : theme.colors.primary }}>{credit ? '+' : '−'}{formatMoney(Number(row.amount))}</Text>
                </Card.Content>
                {row.entry_type==='payment'&&<Card.Actions>{(()=>{const data={title:'Reçu de paiement client',party:customer.data!.name,amount:Number(row.amount),balanceBefore:Number(row.balance_before??0),balanceAfter:Number(row.balance_after??0),date:row.created_at,reference:`CLIENT-${row.id.slice(0,8).toUpperCase()}`,note:row.note,company:membership?.companyName,store:membership?.storeName,issuedBy:membership?.role==='company_admin'?'Administrateur':'Employé'};const printKey=`print-${row.id}`,shareKey=`share-${row.id}`;return [<AppButton key={printKey} mode="text" icon="printer" loading={receiptAction.runningKey===printKey} disabled={!!receiptAction.runningKey} onPress={()=>void receiptAction.run(printKey,()=>printPaymentReceipt(data,formatMoney))}>Imprimer</AppButton>,<AppButton key={shareKey} mode="text" icon="share-variant" loading={receiptAction.runningKey===shareKey} disabled={!!receiptAction.runningKey} onPress={()=>void receiptAction.run(shareKey,()=>sharePaymentReceipt(data,formatMoney))}>Partager</AppButton>]})()}</Card.Actions>}
              </Card>
            );
          })}
          {!ledger.isLoading && !(ledger.data ?? []).length && <Chip icon="information-outline">Aucun mouvement d’ardoise.</Chip>}
        </>
      )}

      <Portal>
        <Dialog visible={!!entryType} onDismiss={() => setEntryType(null)}>
          <Dialog.Title>{entryType === 'credit' ? 'Ajouter une dette' : entryType==='discount'?'Accorder une remise sur dette':'Encaisser un paiement'}</Dialog.Title>
          <Dialog.ScrollArea style={{ paddingHorizontal: 0 }}><ScrollView contentContainerStyle={{ gap: 12, paddingHorizontal: 24, paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
            <TextInput testID="customer-entry-amount" mode="outlined" label="Montant" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" left={<TextInput.Icon icon="cash" />} />
            {entryType==='payment'&&<SelectField
              label="Moyen de paiement"
              value={entryPaymentMethod}
              onChange={value=>setEntryPaymentMethod((value??'cash') as 'cash'|'mobile_money')}
              options={[{label:'Espèces',value:'cash'},{label:'Mobile Money',value:'mobile_money'}]}
            />}
            <TextInput mode="outlined" label={entryType==='discount'?'Motif obligatoire':'Note (facultatif)'} value={note} onChangeText={setNote} />
            {!!entry.error && <HelperText type="error" visible>{entry.error.message}</HelperText>}
          </ScrollView></Dialog.ScrollArea>
          <Dialog.Actions>
            <AppButton mode="text" onPress={() => setEntryType(null)}>Annuler</AppButton>
            <AppButton testID="customer-entry-confirm" loading={entry.isPending} disabled={!amountValid || entry.isPending || (entryType==='discount'&&note.trim().length<3)} buttonColor={entryType === 'credit' ? theme.colors.error : undefined} onPress={() => entry.mutate()}>Confirmer</AppButton>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={editing} onDismiss={() => setEditing(false)}>
          <Dialog.Title>Modifier la fiche</Dialog.Title>
          <Dialog.ScrollArea style={{ paddingHorizontal: 0 }}><ScrollView contentContainerStyle={{ gap: 12, paddingHorizontal: 24, paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
            <FormField control={control} name="name" label="Nom du client" />
            <FormField control={control} name="phone" label="Téléphone" keyboardType="phone-pad" />
            <FormField control={control} name="email" label="Email" autoCapitalize="none" keyboardType="email-address" />
            <FormField control={control} name="address" label="Adresse" />
            <FormField control={control} name="note" label="Note" multiline />
            <FormField control={control} name="creditLimit" label="Limite de crédit (vide = illimitée)" keyboardType="decimal-pad" />
            <Controller control={control} name="isActive" render={({ field }) => <Card mode="outlined"><Card.Title title="Client actif" right={() => <Switch value={field.value} onValueChange={field.onChange} style={{ marginRight: 12 }} />} /></Card>} />
            {!!edit.error && <HelperText type="error" visible>{edit.error.message}</HelperText>}
          </ScrollView></Dialog.ScrollArea>
          <Dialog.Actions>
            <AppButton mode="text" onPress={() => setEditing(false)}>Annuler</AppButton>
            <AppButton loading={edit.isPending} disabled={edit.isPending} onPress={handleSubmit((value) => edit.mutate(value))}>Enregistrer</AppButton>
          </Dialog.Actions>
        </Dialog>
        <Dialog visible={scheduleOpen} onDismiss={()=>!saveSchedule.isPending&&setScheduleOpen(false)}>
          <Dialog.Title>Échéancier de la dette</Dialog.Title>
          <Dialog.ScrollArea style={{paddingHorizontal:0}}><ScrollView contentContainerStyle={{gap:12,paddingHorizontal:24,paddingBottom:12}}>{scheduleRows.map((row,index)=><Card key={index} mode="outlined"><Card.Content style={{gap:8}}><TextInput mode="outlined" label="Date (AAAA-MM-JJ)" value={row.dueDate} onChangeText={dueDate=>setScheduleRows(rows=>rows.map((item,i)=>i===index?{...item,dueDate}:item))}/><TextInput mode="outlined" label="Montant" keyboardType="decimal-pad" value={row.amount} onChangeText={amount=>setScheduleRows(rows=>rows.map((item,i)=>i===index?{...item,amount}:item))}/>{scheduleRows.length>1&&<AppButton mode="text" textColor="#C92A2A" onPress={()=>setScheduleRows(rows=>rows.filter((_,i)=>i!==index))}>Retirer</AppButton>}</Card.Content></Card>)}<AppButton mode="outlined" icon="plus" onPress={()=>setScheduleRows(rows=>[...rows,{dueDate:new Date(Date.now()+(rows.length+1)*30*86400000).toISOString().slice(0,10),amount:''}])}>Ajouter une échéance</AppButton><HelperText type="info" visible>Total requis : {formatMoney(balance)}. Total saisi : {formatMoney(scheduleRows.reduce((sum,row)=>sum+(parseDecimal(row.amount)||0),0))}</HelperText>{!!saveSchedule.error&&<HelperText type="error" visible>{saveSchedule.error.message}</HelperText>}</ScrollView></Dialog.ScrollArea>
          <Dialog.Actions><AppButton mode="text" onPress={()=>setScheduleOpen(false)}>Fermer</AppButton><AppButton loading={saveSchedule.isPending} disabled={saveSchedule.isPending||Math.abs(scheduleRows.reduce((sum,row)=>sum+(parseDecimal(row.amount)||0),0)-balance)>0.01} onPress={()=>saveSchedule.mutate()}>Enregistrer</AppButton></Dialog.Actions>
        </Dialog>
      </Portal>
      <Snackbar visible={!!message} onDismiss={() => setMessage('')} duration={3000}>{message}</Snackbar>
      <Snackbar visible={!!receiptAction.error} onDismiss={receiptAction.clearError}>{receiptAction.error}</Snackbar>
    </AdminPage>
  );
}
