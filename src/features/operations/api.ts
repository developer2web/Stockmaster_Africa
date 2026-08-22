import { supabase } from '@/services/supabase/client';
import { createOperationId } from '@/utils/operationId';
import { userErrorMessage } from '@/utils/errors';

function fail(error: { message: string } | null) {
  if (error) throw new Error(userErrorMessage(error));
}

export type PurchaseLine = { productId: string; name: string; quantity: number; unitCost: number };

export type SupplierPurchase = {
  id: string;
  total: number;
  amount_paid: number;
  amount_due: number;
  payment_status: 'paid' | 'partial' | 'due'|'cancelled';
  cancelled_at:string|null;
  cancellation_reason:string|null;
  created_at: string;
};

export type SupplierPayment = {
  id: string;
  amount: number;
  payment_method: 'cash' | 'mobile_money' | 'card' | 'bank_transfer';
  note: string | null;
  balance_before: number | null;
  balance_after: number | null;
  created_at: string;
  creator: { full_name:string } | null;
};

export async function getSupplierAccount(companyId: string, storeId: string, supplierId: string) {
  const [purchases, payments,summary] = await Promise.all([
    supabase
      .from('purchases')
      .select('id,total,amount_paid,amount_due,payment_status,cancelled_at,cancellation_reason,created_at')
      .eq('company_id', companyId)
      .eq('store_id', storeId)
      .eq('supplier_id', supplierId)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('supplier_payments')
      .select('id,amount,payment_method,note,balance_before,balance_after,created_at,creator:profiles!supplier_payments_created_by_fkey(full_name)')
      .eq('company_id', companyId)
      .eq('store_id', storeId)
      .eq('supplier_id', supplierId)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.rpc('get_supplier_account_summary',{p_store_id:storeId,p_supplier_id:supplierId}),
  ]);
  fail(purchases.error);
  fail(payments.error);
  fail(summary.error);
  const purchaseRows = (purchases.data ?? []) as SupplierPurchase[];
  const totals=Array.isArray(summary.data)?summary.data[0]:summary.data;
  return {
    purchases: purchaseRows,
    payments: (payments.data ?? []) as unknown as SupplierPayment[],
    total: Number(totals?.total??0),
    paid: Number(totals?.paid??0),
    due: Number(totals?.due??0),
  };
}

export async function recordSupplierPayment(input: {
  storeId: string;
  supplierId: string;
  amount: number;
  paymentMethod: SupplierPayment['payment_method'];
  note?: string;
}) {
  if (!input.storeId || !input.supplierId) throw new Error('Sélectionnez un fournisseur et une boutique.');
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error('Le montant doit être supérieur à zéro.');
  const { data, error } = await supabase.rpc('record_supplier_payment', {
    p_store_id: input.storeId,
    p_supplier_id: input.supplierId,
    p_amount: input.amount,
    p_payment_method: input.paymentMethod,
    p_note: input.note?.trim() || null,
    p_operation_id: createOperationId(),
  });
  fail(error);
  return data as string;
}

export async function recordPurchase(storeId: string, supplierId: string, items: PurchaseLine[], paid: boolean) {
  if (!storeId || !supplierId) throw new Error('Sélectionnez une boutique et un fournisseur.');
  if (!items.length || items.some((item) => !item.productId || !(item.quantity > 0) || item.unitCost < 0)) {
    throw new Error('La commande contient une ligne invalide.');
  }
  const { data, error } = await supabase.rpc('record_purchase', {
    p_store_id: storeId,
    p_supplier_id: supplierId,
    p_items: items.map((item) => ({ productId: item.productId, quantity: item.quantity, unitCost: item.unitCost })),
    p_paid: paid,
    p_operation_id: createOperationId(),
  });
  fail(error);
  return data as string;
}

export async function cancelPurchase(purchaseId:string,reason:string,refundMethod:'cash'|'mobile_money'){
  if(reason.trim().length<3)throw new Error('Le motif d’annulation est obligatoire.');
  const{data,error}=await supabase.rpc('cancel_purchase',{p_purchase_id:purchaseId,p_reason:reason.trim(),p_refund_method:refundMethod,p_operation_id:createOperationId()});
  fail(error);return data as string;
}

export async function transferStock(fromStoreId: string, toStoreId: string, productId: string, quantity: number) {
  if (!fromStoreId || !toStoreId || fromStoreId === toStoreId) throw new Error('Choisissez deux boutiques différentes.');
  if (!productId || !(quantity > 0)) throw new Error('Sélectionnez un produit et une quantité valide.');
  const { data, error } = await supabase.rpc('transfer_stock', {
    p_from_store_id: fromStoreId,
    p_to_store_id: toStoreId,
    p_product_id: productId,
    p_quantity: quantity,
    p_operation_id: createOperationId(),
  });
  fail(error);
  return data as string;
}
