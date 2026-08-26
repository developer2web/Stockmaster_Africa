import type { QueryClient } from '@tanstack/react-query';

/** Invalide les indicateurs dérivés après une opération métier réussie. */
export async function invalidateOperationalSummaries(
  queryClient: QueryClient,
  companyId: string,
  storeId?: string | null,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['admin-overview', companyId] }),
    queryClient.invalidateQueries({ queryKey: ['dashboard-trends', companyId] }),
    queryClient.invalidateQueries({ queryKey: ['dashboard-report', companyId] }),
    queryClient.invalidateQueries({ queryKey: ['business-report', companyId] }),
    queryClient.invalidateQueries({ queryKey: ['sales-net-profit', companyId] }),
    queryClient.invalidateQueries({ queryKey: ['report-financial-details', companyId] }),
    queryClient.invalidateQueries({ queryKey: ['report-cash-balance', companyId] }),
    ...(storeId
      ? [queryClient.invalidateQueries({ queryKey: ['cash-summary', companyId, storeId] })]
      : []),
  ]);
}
