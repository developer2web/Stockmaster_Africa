import type { QueryClient } from '@tanstack/react-query';

/**
 * Invalide les caches qui affichent la fiche d'un produit et ses vignettes ailleurs dans
 * l'app (listes produits, catalogue employé, grille de vente). Sans ça, une photo ajoutée ou
 * changée depuis la fiche produit n'apparaissait qu'à cet endroit tant que ces autres écrans
 * n'étaient pas rechargés séparément — vu comme des « photos qui ne se synchronisent pas bien »
 * (retour testeur employé du 24/09).
 */
export async function invalidateProductCaches(
  queryClient: QueryClient,
  companyId: string,
  storeId: string,
  productId?: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['products', companyId, storeId] }),
    queryClient.invalidateQueries({ queryKey: ['employee-products', companyId, storeId] }),
    queryClient.invalidateQueries({ queryKey: ['employee-catalog-products', companyId, storeId] }),
    queryClient.invalidateQueries({ queryKey: ['sale-stock', companyId, storeId] }),
    ...(productId ? [queryClient.invalidateQueries({ queryKey: ['product', productId] })] : []),
  ]);
}

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
