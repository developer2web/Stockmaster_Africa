import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ScrollView } from 'react-native';
import { Card, Chip, Dialog, FAB, HelperText, Portal, Searchbar, Switch, Text, TextInput } from 'react-native-paper';
import { FormField } from '@/components/forms/FormField';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/features/auth/AuthProvider';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import { getSupplierAccount, recordSupplierPayment, type SupplierPayment } from '@/features/operations/api';
import { getSuppliers, getSupplierStats, saveSupplier } from '@/features/products/api';
import { supplierSchema, type SupplierInput } from '@/schemas/catalog';
import type { Supplier } from '@/types/database';
import { parseDecimal } from '@/utils/number';

const paymentLabels: Record<SupplierPayment['payment_method'], string> = {
  cash: 'Espèces',
  mobile_money: 'Mobile Money',
  card: 'Carte',
  bank_transfer: 'Virement',
};

export default function Suppliers() {
  const { membership } = useAuth();
  const { formatMoney } = useCurrency();
  const company = membership?.companyId ?? '';
  const store = membership?.storeId ?? '';
  const cache = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [selected, setSelected] = useState<Supplier | null>(null);
  const [search, setSearch] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<SupplierPayment['payment_method']>('cash');

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

  const { control, handleSubmit, reset } = useForm<SupplierInput>({
    resolver: zodResolver(supplierSchema),
    defaultValues: { name: '', email: '', phone: '', address: '', isActive: true },
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
    mutationFn: () => recordSupplierPayment({ storeId: store, supplierId: selected!.id, amount: parseDecimal(amount), paymentMethod, note }),
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['supplier-account', company, store, selected?.id] }),
        cache.invalidateQueries({ queryKey: ['supplier-stats', company, store] }),
        cache.invalidateQueries({ queryKey: ['cash-transactions', company, store] }),
        cache.invalidateQueries({ queryKey: ['cash-summary', company, store] }),
      ]);
      setAmount('');
      setNote('');
      setSelected(null);
    },
  });

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
    setSelected(item);
  };
  const parsedAmount = parseDecimal(amount);

  return <AdminPage title="Fournisseurs" action={<FAB size="small" icon="plus" accessibilityLabel="Ajouter un fournisseur" onPress={() => show()} />}>
    <Searchbar placeholder="Nom, email ou téléphone" value={search} onChangeText={setSearch} />
    {!!query.error && <HelperText type="error" visible>{query.error.message}</HelperText>}
    {!!stats.error && <HelperText type="error" visible>{stats.error.message}</HelperText>}
    {shown.map((item) => {
      const summary = stats.data?.[item.id];
      const due = summary?.due ?? 0;
      return <Card key={item.id} mode="outlined">
        <Card.Title title={item.name} subtitle={[item.email, item.phone].filter(Boolean).join(' • ') || 'Aucun contact'} right={() => <Chip style={{ marginRight: 12 }} compact>{item.is_active ? 'Actif' : 'Archivé'}</Chip>} />
        <Card.Content>
          <Text>Total achats : {formatMoney(summary?.total ?? 0)}</Text>
          <Text style={due > 0 ? { fontWeight: '800', color: '#C92A2A' } : undefined}>Dette restante : {formatMoney(due)}</Text>
          <Text>Livraisons : {summary?.count ?? 0}{summary?.lastDelivery ? ` • dernière le ${new Date(summary.lastDelivery).toLocaleDateString('fr-CA')}` : ''}</Text>
        </Card.Content>
        <Card.Actions>
          <AppButton mode="text" icon="pencil" onPress={() => show(item)}>Modifier</AppButton>
          {due > 0 && <AppButton icon="cash-check" onPress={() => showPayment(item)}>Régler</AppButton>}
        </Card.Actions>
      </Card>;
    })}
    <AppButton icon="truck-check-outline" onPress={() => router.push('/purchases' as never)}>Nouvel approvisionnement</AppButton>
    {!query.isLoading && !shown.length && <EmptyState icon={search ? 'magnify' : 'truck-plus'} title={search ? 'Aucun résultat' : 'Aucun fournisseur'} message={search ? 'Modifiez votre recherche.' : 'Ajoutez votre premier fournisseur.'} />}
    <Portal>
      <Dialog visible={open} onDismiss={() => setOpen(false)}>
        <Dialog.Title>{editing ? 'Modifier le fournisseur' : 'Nouveau fournisseur'}</Dialog.Title>
        <Dialog.ScrollArea style={{ paddingHorizontal: 0 }}><ScrollView contentContainerStyle={{ gap: 12, paddingHorizontal: 24, paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
          <FormField control={control} name="name" label="Nom" />
          <FormField control={control} name="email" label="Email" keyboardType="email-address" autoCapitalize="none" />
          <FormField control={control} name="phone" label="Téléphone" keyboardType="phone-pad" />
          <FormField control={control} name="address" label="Adresse" multiline />
          <Controller control={control} name="isActive" render={({ field }) => <Card mode="outlined"><Card.Title title="Fournisseur actif" right={() => <Switch value={field.value} onValueChange={field.onChange} style={{ marginRight: 12 }} />} /></Card>} />
          {!!mutation.error && <HelperText type="error" visible>{mutation.error.message}</HelperText>}
        </ScrollView></Dialog.ScrollArea>
        <Dialog.Actions><AppButton mode="text" onPress={() => setOpen(false)}>Annuler</AppButton><AppButton loading={mutation.isPending} disabled={mutation.isPending} onPress={handleSubmit((value) => mutation.mutate(value))}>Enregistrer</AppButton></Dialog.Actions>
      </Dialog>

      <Dialog visible={!!selected} onDismiss={() => setSelected(null)}>
        <Dialog.Title>Régler {selected?.name}</Dialog.Title>
        <Dialog.ScrollArea style={{ paddingHorizontal: 0 }}><ScrollView contentContainerStyle={{ gap: 12, paddingHorizontal: 24, paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
          {!!account.error && <HelperText type="error" visible>{account.error.message}</HelperText>}
          <Card mode="contained"><Card.Title title={`Dette restante : ${formatMoney(account.data?.due ?? 0)}`} subtitle={`Déjà payé : ${formatMoney(account.data?.paid ?? 0)} • Achats : ${formatMoney(account.data?.total ?? 0)}`} /></Card>
          <TextInput mode="outlined" label="Montant du règlement" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
          <Text variant="titleSmall">Moyen de paiement</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {(Object.keys(paymentLabels) as SupplierPayment['payment_method'][]).map((method) => <Chip key={method} selected={paymentMethod === method} onPress={() => setPaymentMethod(method)}>{paymentLabels[method]}</Chip>)}
          </ScrollView>
          <TextInput mode="outlined" label="Note (facultative)" value={note} onChangeText={setNote} multiline />
          {!!paymentMutation.error && <HelperText type="error" visible>{paymentMutation.error.message}</HelperText>}
          <Text variant="titleMedium">Achats non soldés</Text>
          {(account.data?.purchases ?? []).filter((row) => Number(row.amount_due) > 0).map((row) => <Card key={row.id} mode="outlined"><Card.Title title={formatMoney(Number(row.amount_due))} subtitle={`${row.payment_status === 'partial' ? 'Paiement partiel' : 'À payer'} • ${new Date(row.created_at).toLocaleDateString('fr-CA')}`} /></Card>)}
          {!(account.data?.purchases ?? []).some((row) => Number(row.amount_due) > 0) && !account.isLoading && <Text>Aucune dette fournisseur.</Text>}
          <Text variant="titleMedium">Historique des règlements</Text>
          {(account.data?.payments ?? []).map((row) => <Card key={row.id} mode="outlined"><Card.Title title={formatMoney(Number(row.amount))} subtitle={`${paymentLabels[row.payment_method]} • ${new Date(row.created_at).toLocaleString('fr-CA')}`} />{!!row.note && <Card.Content><Text>{row.note}</Text></Card.Content>}</Card>)}
          {!account.data?.payments.length && !account.isLoading && <Text>Aucun règlement enregistré.</Text>}
        </ScrollView></Dialog.ScrollArea>
        <Dialog.Actions><AppButton mode="text" onPress={() => setSelected(null)}>Fermer</AppButton><AppButton icon="cash-check" loading={paymentMutation.isPending} disabled={paymentMutation.isPending || account.isLoading || !(parsedAmount > 0) || parsedAmount > (account.data?.due ?? 0)} onPress={() => paymentMutation.mutate()}>Enregistrer le paiement</AppButton></Dialog.Actions>
      </Dialog>
    </Portal>
  </AdminPage>;
}
