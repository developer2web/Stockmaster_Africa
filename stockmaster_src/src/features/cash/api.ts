import { supabase } from '@/services/supabase/client';
import { userErrorMessage } from '@/utils/errors';
import { createOperationId } from '@/utils/operationId';

export type CashTransaction = {
  id: string;
  company_id: string;
  store_id: string | null;
  transaction_type: 'deposit' | 'withdrawal';
  designation: string;
  amount: number;
  currency_code: string;
  secondary_currency_code: string | null;
  secondary_exchange_rate: number | null;
  exchange_rate_effective_at: string | null;
  created_at: string;
  store: { name: string } | null;
  creator: { full_name: string } | null;
};

export const CASH_PAGE_SIZE = 40;

export type CashSummary = { deposits: number; withdrawals: number; balance: number };

export async function getCashSummary(storeId: string): Promise<CashSummary> {
  const { data, error } = await supabase.rpc('get_store_cash_summary', { p_store_id: storeId });
  if (error) throw new Error(userErrorMessage(error));
  const row = Array.isArray(data) ? data[0] : data;
  return {
    deposits: Number(row?.deposits ?? 0),
    withdrawals: Number(row?.withdrawals ?? 0),
    balance: Number(row?.balance ?? 0),
  };
}

export async function getCashTransactions(companyId: string, storeId: string, page = 0): Promise<CashTransaction[]> {
  const start = page * CASH_PAGE_SIZE;
  const { data, error } = await supabase.from('cash_transactions')
    .select('id,company_id,store_id,transaction_type,designation,amount,currency_code,secondary_currency_code,secondary_exchange_rate,exchange_rate_effective_at,created_at,store:stores(name),creator:profiles!cash_transactions_created_by_fkey(full_name)')
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .range(start, start + CASH_PAGE_SIZE - 1);
  if (error) throw new Error(userErrorMessage(error));
  return (data ?? []) as unknown as CashTransaction[];
}

export async function createCashTransaction(input: {
  companyId: string;
  storeId: string;
  type: 'deposit' | 'withdrawal';
  designation: string;
  amount: number;
}, operationId = createOperationId()) {
  if (!input.companyId || !input.storeId) throw new Error('Sélectionnez une boutique avant cette opération.');
  if (input.designation.trim().length < 2) throw new Error('Indiquez une désignation.');
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error('Le montant doit être supérieur à zéro.');
  const { error } = await supabase.rpc('record_cash_transaction', {
    p_store_id: input.storeId,
    p_transaction_type: input.type,
    p_designation: input.designation.trim(),
    p_amount: input.amount,
    p_operation_id: operationId,
  });
  if (error) throw new Error(userErrorMessage(error));
}
