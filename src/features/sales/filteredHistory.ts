import { supabase } from '@/services/supabase/client';
import { withOfflineCache } from '@/features/offline/storage';
import type { Sale } from '@/types/database';
import { getSales, SALE_PAGE_SIZE } from './api';

export type HistoryCriteria = { search: string; after: string | null; before: string | null; payment: string | null; status: string };
export async function getFilteredSales(companyId: string, storeId: string, page: number, criteria: HistoryCriteria): Promise<Sale[]> {
  if (!criteria.search && !criteria.after && !criteria.before && !criteria.payment && criteria.status === 'all') {
    return getSales(companyId, storeId, page, false);
  }
  return withOfflineCache(`filtered-sales:${companyId}:${storeId}:${page}:${JSON.stringify(criteria)}`, async () => {
    const { data, error } = await supabase.rpc('get_filtered_sales_history', {
      p_company_id: companyId, p_store_id: storeId, p_offset: page * SALE_PAGE_SIZE, p_limit: SALE_PAGE_SIZE,
      p_search: criteria.search, p_after: criteria.after, p_before: criteria.before,
      p_payment: criteria.payment, p_status: criteria.status,
    });
    if (error) {
      if (error.code === 'PGRST202' || error.code === '42883') throw new Error('Les nouveaux filtres nécessitent la mise à jour du serveur. Contactez le propriétaire.');
      throw new Error(error.message);
    }
    return (Array.isArray(data) ? data : []) as Sale[];
  }, Array.isArray);
}
