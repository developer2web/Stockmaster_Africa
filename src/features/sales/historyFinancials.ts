import { supabase } from '@/services/supabase/client';
import { fetchAllRows } from '@/services/supabase/pagination';

export type HistoryFinancial = { sale_id: string; cost_total: number; gross_profit: number };

/** Financial access is independent of permission to read the sales history. */
export async function getHistoryFinancials(companyId: string, storeId: string, saleIds: string[]) {
  const result: HistoryFinancial[] = [];
  const ids = [...new Set(saleIds)];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100);
    const rows = await fetchAllRows((from, to) => supabase.from('sale_financials')
      .select('sale_id,cost_total,gross_profit')
      .eq('company_id', companyId).eq('store_id', storeId)
      .in('sale_id', batch).order('sale_id').range(from, to));
    result.push(...rows as HistoryFinancial[]);
  }
  return result;
}

export async function getSaleItemFinancials(companyId: string, saleId: string) {
  return fetchAllRows((from, to) => supabase.from('sale_item_financials')
      .select('sale_item_id,purchase_price_snapshot,gross_profit')
      .eq('company_id', companyId).eq('sale_id', saleId)
      .order('sale_item_id').range(from, to));
}
