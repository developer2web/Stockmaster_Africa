import { supabase } from '@/services/supabase/client';
import { userErrorMessage } from '@/utils/errors';
import { createOperationId } from '@/utils/operationId';
import { parseDecimal } from '@/utils/number';
import type { CustomerInput } from '@/schemas/customers';
import { withOfflineCache } from '@/features/offline/storage';

export type Customer = {
  id: string;
  company_id: string;
  store_id: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  note: string | null;
  is_active: boolean;
  created_at: string;
  balance?: number;
};

export type CustomerLedgerEntry = {
  id: string;
  customer_id: string;
  store_id: string | null;
  entry_type: 'credit' | 'payment';
  amount: number;
  sale_id: string | null;
  note: string | null;
  balance_before: number | null;
  balance_after: number | null;
  created_at: string;
};

export type CustomerSale = {
  id: string;
  reference: string | null;
  total: number;
  payment_method: string | null;
  created_at: string;
  store: { name: string } | null;
};

function fail(error: { message: string } | null) {
  if (error) throw new Error(userErrorMessage(error));
}
const empty = (value?: string) => value?.trim() || null;

async function attachBalances(customers: Customer[]) {
  if (!customers.length) return customers;
  const { data, error } = await supabase
    .from('customer_balances')
    .select('customer_id,balance')
    .in('customer_id', customers.map((customer) => customer.id));
  fail(error);
  const map = new Map((data ?? []).map((row) => [(row as { customer_id: string }).customer_id, Number((row as { balance: number }).balance)]));
  for (const customer of customers) customer.balance = map.get(customer.id) ?? 0;
  return customers;
}

export async function getCustomers(companyId: string, search = ''): Promise<Customer[]> {
  return withOfflineCache(`customers:${companyId}:${search.trim().toLowerCase()}`, async () => {
  let query = supabase
    .from('customers')
    .select('id,company_id,store_id,name,phone,email,address,note,is_active,created_at')
    .eq('company_id', companyId)
    .order('name')
    .limit(300);
  if (search.trim()) {
    const safe = search.trim().replaceAll(',', ' ');
    query = query.or(`name.ilike.%${safe}%,phone.ilike.%${safe}%,email.ilike.%${safe}%`);
  }
  const { data, error } = await query;
  fail(error);
  return attachBalances((data ?? []) as Customer[]);
  });
}

export async function getCustomer(id: string): Promise<Customer> {
  const { data, error } = await supabase
    .from('customers')
    .select('id,company_id,store_id,name,phone,email,address,note,is_active,created_at')
    .eq('id', id)
    .single();
  fail(error);
  const customer = data as Customer;
  const { data: balance, error: balanceError } = await supabase.from('customer_balances').select('balance').eq('customer_id', id).maybeSingle();
  fail(balanceError);
  customer.balance = Number((balance as { balance?: number } | null)?.balance ?? 0);
  return customer;
}

export async function saveCustomer(companyId: string, storeId: string | null, value: CustomerInput, id?: string): Promise<string> {
  const payload = {
    company_id: companyId,
    store_id: storeId,
    name: value.name.trim(),
    phone: empty(value.phone),
    email: empty(value.email),
    address: empty(value.address),
    note: empty(value.note),
    is_active: value.isActive,
  };
  if (id) {
    const { error } = await supabase.from('customers').update(payload).eq('id', id);
    fail(error);
    return id;
  }
  const { data, error } = await supabase.from('customers').insert(payload).select('id').single();
  fail(error);
  return data!.id;
}

export async function getCustomerLedger(customerId: string): Promise<CustomerLedgerEntry[]> {
  const { data, error } = await supabase
    .from('customer_ledger')
    .select('id,customer_id,store_id,entry_type,amount,sale_id,note,balance_before,balance_after,created_at')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(200);
  fail(error);
  return (data ?? []) as CustomerLedgerEntry[];
}

export async function getCustomerSales(companyId: string, customerId: string): Promise<CustomerSale[]> {
  const { data, error } = await supabase.rpc('get_customer_sales_safe',{p_company_id:companyId,p_customer_id:customerId});
  fail(error);
  return (Array.isArray(data)?data:[]) as unknown as CustomerSale[];
}

export async function recordCustomerEntry(
  input: { customerId: string; storeId: string | null; type: 'credit' | 'payment'; amount: string; note?: string },
  operationId = createOperationId(),
) {
  const amount = parseDecimal(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Le montant doit être supérieur à zéro.');
  const { error } = await supabase.rpc('record_customer_entry', {
    p_customer_id: input.customerId,
    p_store_id: input.storeId,
    p_entry_type: input.type,
    p_amount: amount,
    p_note: input.note ?? null,
    p_sale_id: null,
    p_operation_id: operationId,
  });
  if (error) throw new Error(userErrorMessage(error));
}
