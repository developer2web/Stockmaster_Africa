import { supabase } from '@/services/supabase/client';
import { userErrorMessage } from '@/utils/errors';
import { createOperationId } from '@/utils/operationId';
import { isDeviceOffline } from '@/features/offline/connectivity';
import { createOfflineMetadata } from '@/features/offline/device';
import { enqueueOfflineOperation } from '@/features/offline/queue';
import { withOfflineCache } from '@/features/offline/storage';

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
export type CashClosure = { id:string;closure_date:string;expected_amount:number;counted_amount:number;difference:number;note:string|null;closed_by_label:string;created_at:string;closer:{full_name:string}|null };
export type CashSessionStatus = { requiresOpening:boolean;closureId:string|null;expectedInitial:number;closedAt:string|null;closedByLabel:string|null };

export async function getCashSummary(storeId: string): Promise<CashSummary> {
  return withOfflineCache(`cash-summary:${storeId}`, async () => {
  const { data, error } = await supabase.rpc('get_store_cash_summary', { p_store_id: storeId });
  if (error) throw new Error(userErrorMessage(error));
  const row = Array.isArray(data) ? data[0] : data;
  return {
    deposits: Number(row?.deposits ?? 0),
    withdrawals: Number(row?.withdrawals ?? 0),
    balance: Number(row?.balance ?? 0),
  };
  }, (value): value is CashSummary => !!value && typeof value === 'object' && 'balance' in value);
}

export async function getCashTransactions(companyId: string, storeId: string, page = 0): Promise<CashTransaction[]> {
  return withOfflineCache(`cash-transactions:${companyId}:${storeId}:${page}`, async () => {
  const start = page * CASH_PAGE_SIZE;
  const { data, error } = await supabase.from('cash_transactions')
    .select('id,company_id,store_id,transaction_type,designation,amount,currency_code,secondary_currency_code,secondary_exchange_rate,exchange_rate_effective_at,created_at,store:stores(name),creator:profiles!cash_transactions_created_by_fkey(full_name)')
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .range(start, start + CASH_PAGE_SIZE - 1);
  if (error) throw new Error(userErrorMessage(error));
  return (data ?? []) as unknown as CashTransaction[];
  }, Array.isArray);
}

export async function createCashTransaction(input: {
  companyId: string;
  storeId: string;
  type: 'deposit' | 'withdrawal';
  designation: string;
  amount: number;
}, operationId = createOperationId()): Promise<{ queued: boolean }> {
  if (!input.companyId || !input.storeId) throw new Error('Sélectionnez une boutique avant cette opération.');
  if (input.designation.trim().length < 2) throw new Error('Indiquez une désignation.');
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error('Le montant doit être supérieur à zéro.');
  const payload = {
    p_store_id: input.storeId,
    p_transaction_type: input.type,
    p_designation: input.designation.trim(),
    p_amount: input.amount,
    p_operation_id: operationId,
  };
  if (await isDeviceOffline()) {
    const metadata = await createOfflineMetadata();
    await enqueueOfflineOperation({
      id: operationId,
      type: 'cash',
      createdAt: metadata.createdAt,
      deviceId: metadata.deviceId,
      payload,
    });
    return { queued: true };
  }
  const { error } = await supabase.rpc('record_cash_transaction', payload);
  if (error) throw new Error(userErrorMessage(error));
  return { queued: false };
}

export async function getCashClosures(companyId:string,storeId:string):Promise<CashClosure[]> {
  return withOfflineCache(`cash-closures:${companyId}:${storeId}`, async () => {
  const {data,error}=await supabase.from('cash_closures').select('id,closure_date,expected_amount,counted_amount,difference,note,closed_by_label,created_at,closer:profiles!cash_closures_closed_by_fkey(full_name)').eq('company_id',companyId).eq('store_id',storeId).order('created_at',{ascending:false}).limit(100);
  if(error)throw new Error(userErrorMessage(error));
  return (data??[]) as unknown as CashClosure[];
  }, Array.isArray);
}

export async function closeCash(storeId:string,countedAmount:number,note:string) {
  if(!Number.isFinite(countedAmount)||countedAmount<0)throw new Error('Le montant compté est invalide.');
  const {error}=await supabase.rpc('close_store_cash',{p_store_id:storeId,p_counted_amount:countedAmount,p_note:note.trim()||null});
  if(error)throw new Error(userErrorMessage(error));
}

export async function getCashSessionStatus(storeId:string):Promise<CashSessionStatus>{
  return withOfflineCache(`cash-session:${storeId}`, async () => {
  const{data,error}=await supabase.rpc('get_store_cash_session_status',{p_store_id:storeId});
  if(error)throw new Error(userErrorMessage(error));
  const row=Array.isArray(data)?data[0]:data;
  return {requiresOpening:!!row?.requires_opening,closureId:row?.closure_id??null,expectedInitial:Number(row?.expected_initial??0),closedAt:row?.closed_at??null,closedByLabel:row?.closed_by_label??null};
  }, (value): value is CashSessionStatus => !!value && typeof value === 'object' && 'requiresOpening' in value);
}

export async function openCash(storeId:string,countedAmount:number,note:string){
  if(!Number.isFinite(countedAmount)||countedAmount<0)throw new Error('Le montant initial est invalide.');
  const{error}=await supabase.rpc('open_store_cash',{p_store_id:storeId,p_counted_amount:countedAmount,p_note:note.trim()||null});
  if(error)throw new Error(userErrorMessage(error));
}
