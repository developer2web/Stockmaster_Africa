import { DateField } from '@/components/forms/DateField';
import { localDateValue } from '@/utils/calendar';
import { zodResolver } from '@hookform/resolvers/zod';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Card, Dialog, HelperText, Portal, Text } from 'react-native-paper';

import { FormField } from '@/components/forms/FormField';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { AppFeedback } from '@/components/ui/AppFeedback';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/features/auth/AuthProvider';
import { PermissionGuard } from '@/features/auth/PermissionGuard';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import { expenseSchema, type ExpenseInput } from '@/schemas/reports';
import { createExpense, EXPENSE_PAGE_SIZE, getExpenseRequests, getExpenses, reviewExpenseRequest, type ExpenseRequest } from './expensesApi';
import { getCashSummary } from '@/features/cash/api';
import { parseDecimal } from '@/utils/number';
import { useOffline } from '@/features/offline/OfflineProvider';

const today = () => localDateValue();

export default function ExpensesScreen() {
  const { membership } = useAuth();
  const { formatForCurrency,formatMoney } = useCurrency();
  const company = membership?.companyId ?? '';
  const store = membership?.storeId ?? '';
  const queryClient = useQueryClient();
  const { refreshQueue } = useOffline();
  const [open, setOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [reviewing,setReviewing]=useState<{request:ExpenseRequest;approve:boolean}|null>(null);
  const list = useInfiniteQuery({
    queryKey: ['expenses', company, store],
    queryFn: ({ pageParam }) => getExpenses(company, store, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => lastPage.length === EXPENSE_PAGE_SIZE ? pages.length : undefined,
    enabled: !!company && !!store,
  });
  const expenses = list.data?.pages.flat() ?? [];
  const requests=useQuery({queryKey:['expense-requests',company,store],queryFn:()=>getExpenseRequests(company,store),enabled:!!company&&!!store});
  const { control, handleSubmit, reset } = useForm<ExpenseInput>({ resolver: zodResolver(expenseSchema), defaultValues: { label: '', amount: '', expenseDate: today(), storeId: store || null } });
  const amountValue = useWatch({ control, name: 'amount' });
  const cashSummary = useQuery({ queryKey: ['cash-summary', store], queryFn: () => getCashSummary(store), enabled: !!store });
  const cashBalance = cashSummary.data?.balance ?? 0;
  // Audit externe (SM-01) : une dépense qui dépasserait la caisse actuelle
  // était acceptée sans aucun avertissement. Le serveur la refuse
  // maintenant de toute façon, mais avertir avant l'envoi évite une erreur
  // surprise après la saisie.
  const wouldGoNegative = parseDecimal(amountValue ?? '0') > 0 && cashBalance - parseDecimal(amountValue ?? '0') < 0;
  // Assoupli sur demande explicite du 17/09 : le propriétaire ou un
  // "Manager" (cash_transactions.override_negative_balance) peut passer
  // outre après confirmation explicite — un employé simple reste bloqué
  // sans recours, le serveur refuse de toute façon si cette condition
  // n'est pas remplie.
  const canOverrideNegative = membership?.role === 'company_admin' || !!membership?.permissions.includes('cash_transactions.override_negative_balance');
  const [pendingNegative, setPendingNegative] = useState<ExpenseInput | null>(null);
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['expenses', company, store] }),
      queryClient.invalidateQueries({ queryKey: ['business-report', company] }),
      queryClient.invalidateQueries({ queryKey: ['cash-summary', company, store] }),
      queryClient.invalidateQueries({ queryKey: ['cash-transactions', company, store] }),
    ]);
  };
  const add = useMutation({
    mutationFn: ({ value, confirmNegative }: { value: ExpenseInput; confirmNegative?: boolean }) => createExpense(company, { ...value, storeId: store }, undefined, confirmNegative),
    onSuccess: async (result) => {
      if (result.queued) await refreshQueue(); else await refresh();
      setOpen(false);
      setPendingNegative(null);
      reset({ label: '', amount: '', expenseDate: today(), storeId: store });
      setSuccessMessage(result.queued ? 'Dépense enregistrée hors ligne. Elle sera synchronisée automatiquement.' : result.pending?'Dépense envoyée à l’administrateur pour validation.':'Dépense enregistrée avec succès.');
    },
  });
  const review=useMutation({mutationFn:()=>reviewExpenseRequest(reviewing!.request.id,reviewing!.approve,reviewing!.approve?'Approuvée par l’administrateur':'Refusée par l’administrateur'),onSuccess:async()=>{await Promise.all([requests.refetch(),refresh()]);setReviewing(null)}});
  const canWrite = membership?.role === 'company_admin' || membership?.permissions.includes('expenses.write');

  return (
    <PermissionGuard permission="expenses.read">
      <AdminPage title="Dépenses" action={canWrite ? <AppButton icon="plus" onPress={() => setOpen(true)}>Ajouter</AppButton> : undefined}>
        <HelperText type="info" visible>Une dépense validée est immuable. Toute correction doit être tracée par une nouvelle opération autorisée.</HelperText>
        {(requests.data??[]).filter(item=>item.status==='pending').map(item=><Card key={item.id} mode="contained"><Card.Title title={`En attente • ${item.label}`} subtitle={`${item.expense_date} • ${formatMoney(Number(item.amount))}`}/>{membership?.role==='company_admin'&&<Card.Actions><AppButton mode="text" textColor="#C92A2A" onPress={()=>setReviewing({request:item,approve:false})}>Refuser</AppButton><AppButton onPress={()=>setReviewing({request:item,approve:true})}>Approuver</AppButton></Card.Actions>}</Card>)}
        {expenses.map((expense) => <Card key={expense.id} mode="outlined"><Card.Title title={expense.label} subtitle={`${expense.store?.name ?? 'Boutique'} • ${expense.expense_date}`} right={() => <Text variant="titleMedium" style={{ marginRight: 16 }}>{formatForCurrency(Number(expense.amount), expense.currency_code)}</Text>} /></Card>)}
        {!list.isLoading && !expenses.length && <EmptyState icon="cash-minus" title="Aucune dépense" message="Ajoutez les charges pour obtenir un bénéfice net exact." />}
        {!!list.error && <HelperText type="error" visible>{(list.error as Error).message}</HelperText>}
        {list.hasNextPage && <AppButton mode="outlined" loading={list.isFetchingNextPage} onPress={() => void list.fetchNextPage()}>Charger plus de dépenses</AppButton>}
        <Portal>
          <Dialog visible={open} onDismiss={() => setOpen(false)}>
            <Dialog.Title>Nouvelle dépense</Dialog.Title>
            <Dialog.Content><FormField control={control} name="label" label="Motif" /><FormField control={control} name="amount" label="Montant" keyboardType="decimal-pad" selectTextOnFocus /><Controller control={control} name="expenseDate" render={({ field, fieldState }) => <DateField label="Date de la dépense" value={field.value} onChange={field.onChange} onBlur={field.onBlur} error={fieldState.error?.message} />} />{wouldGoNegative && <HelperText type="error" visible>{canOverrideNegative ? `Ce montant dépasse la caisse actuelle (${formatMoney(cashBalance)}) : elle passera en négatif.` : `Ce montant dépasse la caisse actuelle (${formatMoney(cashBalance)}) : la dépense sera refusée.`}</HelperText>}{!!add.error && <HelperText type="error" visible>{add.error.message}</HelperText>}</Dialog.Content>
            <Dialog.Actions style={{ flexWrap: 'wrap' }}><AppButton mode="text" onPress={() => setOpen(false)}>Annuler</AppButton><AppButton loading={add.isPending} disabled={add.isPending || (wouldGoNegative && !canOverrideNegative)} onPress={handleSubmit((value) => { if (wouldGoNegative && canOverrideNegative) { setPendingNegative(value); return; } add.mutate({ value }); })}>Enregistrer</AppButton></Dialog.Actions>
          </Dialog>
        </Portal>
        <AppFeedback message={successMessage} onDismiss={() => setSuccessMessage('')} />
        <ConfirmDialog visible={!!reviewing} title={reviewing?.approve?'Approuver cette dépense ?':'Refuser cette dépense ?'} message={`${reviewing?.request.label??''} • ${reviewing?formatMoney(Number(reviewing.request.amount)):''}`} destructive={!reviewing?.approve} loading={review.isPending} onCancel={()=>setReviewing(null)} onConfirm={()=>review.mutate()}/>
        <ConfirmDialog visible={!!pendingNegative} title="Caisse insuffisante" message={`Cette dépense dépasse la caisse actuelle (${formatMoney(cashBalance)}) : elle passera en négatif. Continuer quand même ?`} loading={add.isPending} onCancel={() => setPendingNegative(null)} onConfirm={() => { if (pendingNegative) add.mutate({ value: pendingNegative, confirmNegative: true }); }}/>
      </AdminPage>
    </PermissionGuard>
  );
}
