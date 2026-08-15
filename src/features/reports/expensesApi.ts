import type { ExpenseInput } from '@/schemas/reports';
import { supabase } from '@/services/supabase/client';
import type { Expense } from '@/types/database';
import { createOperationId } from '@/utils/operationId';
import { parseDecimal } from '@/utils/number';
import { isDeviceOffline } from '@/features/offline/connectivity';
import { enqueueOfflineOperation } from '@/features/offline/queue';
import { withOfflineCache } from '@/features/offline/storage';

export async function getExpenses(companyId: string, storeId: string): Promise<Expense[]> {
  return withOfflineCache(`expenses:${companyId}:${storeId}`, async () => {
  const { data, error } = await supabase.from('expenses')
    .select('id,company_id,store_id,label,amount,currency_code,secondary_currency_code,secondary_exchange_rate,exchange_rate_effective_at,expense_date,created_at,store:stores(name)')
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .order('expense_date', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Expense[];
  });
}

export async function createExpense(_companyId: string, input: ExpenseInput, operationId = createOperationId()) {
  if (!input.storeId) throw new Error('Sélectionnez une boutique avant cette dépense.');
  if (!Number.isFinite(parseDecimal(input.amount)) || parseDecimal(input.amount) <= 0) {
    throw new Error('Le montant doit être supérieur à zéro.');
  }
  const payload = {
    p_store_id: input.storeId,
    p_label: input.label.trim(),
    p_amount: parseDecimal(input.amount),
    p_expense_date: input.expenseDate,
    p_operation_id: operationId,
  };
  if (await isDeviceOffline()) {
    await enqueueOfflineOperation({ id: operationId, type: 'expense', payload });
    return { queued: true };
  }
  const { error } = await supabase.rpc('record_expense', payload);
  if (error) throw new Error(error.message);
  return { queued: false };
}

export async function deleteExpense(id: string) {
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
