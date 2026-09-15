// Pagination par curseur (keyset) au lieu d'OFFSET : nécessaire pour que les
// listes produits/ventes restent rapides même profond dans la liste, sur un
// catalogue qui continue de grossir sur plusieurs mois (OFFSET ralentit avec
// la profondeur ; le curseur non). null = première page ; le curseur d'une
// page est la position (created_at, id) de sa dernière ligne.
export type PageCursor = { createdAt: string; id: string } | null;

export function nextPageCursor<T extends { created_at: string; id: string }>(
  page: T[],
  pageSize: number,
): { createdAt: string; id: string } | undefined {
  if (page.length < pageSize) return undefined;
  const last = page[page.length - 1];
  return { createdAt: last.created_at, id: last.id };
}
