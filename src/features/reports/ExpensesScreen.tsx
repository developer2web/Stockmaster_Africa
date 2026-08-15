import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Card, Dialog, FAB, HelperText, Portal, Snackbar, Text } from 'react-native-paper';

import { FormField } from '@/components/forms/FormField';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/features/auth/AuthProvider';
import { PermissionGuard } from '@/features/auth/PermissionGuard';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import { expenseSchema, type ExpenseInput } from '@/schemas/reports';
import type { Expense } from '@/types/database';
import { createExpense, deleteExpense, getExpenses } from './expensesApi';
import { useOffline } from '@/features/offline/OfflineProvider';

const today = () => new Date().toISOString().slice(0, 10);

export default function ExpensesScreen() {
  const { membership } = useAuth();
  const { formatForCurrency } = useCurrency();
  const company = membership?.companyId ?? '';
  const store = membership?.storeId ?? '';
  const queryClient = useQueryClient();
  const { refreshQueue } = useOffline();
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState<Expense | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const list = useQuery({ queryKey: ['expenses', company, store], queryFn: () => getExpenses(company, store), enabled: !!company && !!store });
  const { control, handleSubmit, reset } = useForm<ExpenseInput>({ resolver: zodResolver(expenseSchema), defaultValues: { label: '', amount: '', expenseDate: today(), storeId: store || null } });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['expenses', company, store] }),
      queryClient.invalidateQueries({ queryKey: ['business-report', company] }),
      queryClient.invalidateQueries({ queryKey: ['cash-summary', company, store] }),
      queryClient.invalidateQueries({ queryKey: ['cash-transactions', company, store] }),
    ]);
  };
  const add = useMutation({
    mutationFn: (value: ExpenseInput) => createExpense(company, { ...value, storeId: store }),
    onSuccess: async (result) => {
      if (result.queued) await refreshQueue(); else await refresh();
      setOpen(false);
      reset({ label: '', amount: '', expenseDate: today(), storeId: store });
      setSuccessMessage(result.queued ? 'Dépense enregistrée hors ligne. Elle sera synchronisée automatiquement.' : 'Dépense enregistrée avec succès.');
    },
  });
  const remove = useMutation({ mutationFn: deleteExpense, onSuccess: async () => { await refresh(); setRemoving(null); } });
  const canWrite = membership?.role === 'company_admin' || membership?.permissions.includes('expenses.write');

  return (
    <PermissionGuard permission="expenses.read">
      <AdminPage title="Dépenses" action={canWrite ? <FAB size="small" icon="plus" onPress={() => setOpen(true)} /> : undefined}>
        {list.data?.map((expense) => <Card key={expense.id} mode="outlined" onLongPress={() => canWrite && setRemoving(expense)}><Card.Title title={expense.label} subtitle={`${expense.store?.name ?? 'Boutique'} • ${expense.expense_date}`} right={() => <Text variant="titleMedium" style={{ marginRight: 16 }}>{formatForCurrency(Number(expense.amount), expense.currency_code)}</Text>} /></Card>)}
        {!list.isLoading && !list.data?.length && <EmptyState icon="cash-minus" title="Aucune dépense" message="Ajoutez les charges pour obtenir un bénéfice net exact." />}
        {!!list.error && <HelperText type="error" visible>{list.error.message}</HelperText>}
        <Portal>
          <Dialog visible={open} onDismiss={() => setOpen(false)}>
            <Dialog.Title>Nouvelle dépense</Dialog.Title>
            <Dialog.Content><FormField control={control} name="label" label="Motif" /><FormField control={control} name="amount" label="Montant" keyboardType="decimal-pad" /><FormField control={control} name="expenseDate" label="Date (AAAA-MM-JJ)" />{!!add.error && <HelperText type="error" visible>{add.error.message}</HelperText>}</Dialog.Content>
            <Dialog.Actions><AppButton mode="text" onPress={() => setOpen(false)}>Annuler</AppButton><AppButton loading={add.isPending} disabled={add.isPending} onPress={handleSubmit((value) => add.mutate(value))}>Enregistrer</AppButton></Dialog.Actions>
          </Dialog>
        </Portal>
        <ConfirmDialog visible={!!removing} title="Supprimer la dépense ?" message="Le bénéfice net du rapport sera recalculé." destructive loading={remove.isPending} onCancel={() => setRemoving(null)} onConfirm={() => { if (removing) remove.mutate(removing.id); }} />
        <Snackbar visible={!!successMessage} onDismiss={() => setSuccessMessage('')} duration={3000}>{successMessage}</Snackbar>
      </AdminPage>
    </PermissionGuard>
  );
}
