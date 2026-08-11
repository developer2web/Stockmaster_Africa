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
import { useAuth } from '@/features/auth/AuthProvider';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import { getCustomer, getCustomerLedger, getCustomerSales, recordCustomerEntry, saveCustomer } from '@/features/customers/api';
import { customerSchema, type CustomerInput } from '@/schemas/customers';

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

  const customer = useQuery({ queryKey: ['customer', id], queryFn: () => getCustomer(id!), enabled: !!id });
  const ledger = useQuery({ queryKey: ['customer-ledger', id], queryFn: () => getCustomerLedger(id!), enabled: !!id });
  const sales = useQuery({ queryKey: ['customer-sales', company, id], queryFn: () => getCustomerSales(company, id!), enabled: !!company && !!id });

  const [entryType, setEntryType] = useState<'credit' | 'payment' | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['customer', id] }),
      queryClient.invalidateQueries({ queryKey: ['customer-ledger', id] }),
      queryClient.invalidateQueries({ queryKey: ['customers', company] }),
    ]);
  };

  const entry = useMutation({
    mutationFn: () => recordCustomerEntry({ customerId: id!, storeId: store, type: entryType!, amount, note }),
    onSuccess: async () => {
      await refresh();
      setEntryType(null);
      setAmount('');
      setNote('');
      setMessage(entryType === 'credit' ? 'Dette ajoutée à l’ardoise.' : 'Paiement enregistré.');
    },
  });

  const { control, handleSubmit, reset } = useForm<CustomerInput>({ resolver: zodResolver(customerSchema), defaultValues: { name: '', phone: '', email: '', address: '', note: '', isActive: true } });
  useEffect(() => {
    if (customer.data) reset({ name: customer.data.name, phone: customer.data.phone ?? '', email: customer.data.email ?? '', address: customer.data.address ?? '', note: customer.data.note ?? '', isActive: customer.data.is_active });
  }, [customer.data, reset]);
  const edit = useMutation({
    mutationFn: (value: CustomerInput) => saveCustomer(company, store, value, id),
    onSuccess: async () => { await refresh(); setEditing(false); setMessage('Fiche client mise à jour.'); },
  });

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
            </Card.Content>
          </Card>

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
            const credit = row.entry_type === 'credit';
            return (
              <Card key={row.id} mode="contained" style={{ backgroundColor: theme.colors.surface }}>
                <Card.Content style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: credit ? theme.colors.errorContainer : theme.colors.primaryContainer }}>
                    <Icon source={credit ? 'notebook-plus-outline' : 'cash-check'} size={22} color={credit ? theme.colors.error : theme.colors.primary} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontWeight: '700' }}>{credit ? 'Dette' : 'Paiement'}</Text>
                    <Text style={{ color: theme.colors.onSurfaceVariant }}>{row.note ?? new Date(row.created_at).toLocaleString('fr-CA')}</Text>
                  </View>
                  <Text variant="titleMedium" style={{ fontWeight: '800', color: credit ? theme.colors.error : theme.colors.primary }}>{credit ? '+' : '−'}{formatMoney(Number(row.amount))}</Text>
                </Card.Content>
              </Card>
            );
          })}
          {!ledger.isLoading && !(ledger.data ?? []).length && <Chip icon="information-outline">Aucun mouvement d’ardoise.</Chip>}
        </>
      )}

      <Portal>
        <Dialog visible={!!entryType} onDismiss={() => setEntryType(null)}>
          <Dialog.Title>{entryType === 'credit' ? 'Ajouter une dette' : 'Encaisser un paiement'}</Dialog.Title>
          <Dialog.ScrollArea style={{ paddingHorizontal: 0 }}><ScrollView contentContainerStyle={{ gap: 12, paddingHorizontal: 24, paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
            <TextInput testID="customer-entry-amount" mode="outlined" label="Montant" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" left={<TextInput.Icon icon="cash" />} />
            <TextInput mode="outlined" label="Note (facultatif)" value={note} onChangeText={setNote} />
            {!!entry.error && <HelperText type="error" visible>{entry.error.message}</HelperText>}
          </ScrollView></Dialog.ScrollArea>
          <Dialog.Actions>
            <AppButton mode="text" onPress={() => setEntryType(null)}>Annuler</AppButton>
            <AppButton testID="customer-entry-confirm" loading={entry.isPending} disabled={!amountValid || entry.isPending} buttonColor={entryType === 'credit' ? theme.colors.error : undefined} onPress={() => entry.mutate()}>Confirmer</AppButton>
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
            <Controller control={control} name="isActive" render={({ field }) => <Card mode="outlined"><Card.Title title="Client actif" right={() => <Switch value={field.value} onValueChange={field.onChange} style={{ marginRight: 12 }} />} /></Card>} />
            {!!edit.error && <HelperText type="error" visible>{edit.error.message}</HelperText>}
          </ScrollView></Dialog.ScrollArea>
          <Dialog.Actions>
            <AppButton mode="text" onPress={() => setEditing(false)}>Annuler</AppButton>
            <AppButton loading={edit.isPending} disabled={edit.isPending} onPress={handleSubmit((value) => edit.mutate(value))}>Enregistrer</AppButton>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      <Snackbar visible={!!message} onDismiss={() => setMessage('')} duration={3000}>{message}</Snackbar>
    </AdminPage>
  );
}
