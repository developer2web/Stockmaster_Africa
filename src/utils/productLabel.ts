// Retour testeur du 26/09 : « Coca cola » (paquet, 35 000 GNF) et « coca cola » (pièce,
// 7 000 GNF) étaient indiscernables dans le catalogue, le panier et le reçu — risque de
// vendre l'un pour l'autre. Quand plusieurs produits portent le même nom (casse, accents et
// espaces ignorés), on ajoute ce qui les distingue : l'unité, ou la référence (SKU) si
// l'unité est la même aussi.

export const unitLabels: Record<string, string> = { piece: 'Pièce', carton: 'Carton', kg: 'kg', litre: 'Litre', sac: 'Sac', paquet: 'Paquet' };
export const unitLabel = (unit: string | null | undefined) => (unit ? unitLabels[unit] ?? unit : '');

export const normalizeProductName = (name: string) =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('fr').replace(/\s+/g, ' ').trim();

type Labelled = { name: string; unit?: string | null; sku?: string | null };

// Pour chaque nom en double, indique si l'unité suffit à distinguer les produits.
export function homonymIndex(items: Labelled[]) {
  const groups = new Map<string, Labelled[]>();
  for (const item of items) {
    const key = normalizeProductName(item.name);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const index = new Map<string, { unitsDiffer: boolean }>();
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    index.set(key, { unitsDiffer: new Set(group.map(item => item.unit ?? '')).size === group.length });
  }
  return index;
}

// Nom affiché : inchangé s'il est unique, sinon « Nom — Paquet » (ou « Nom — réf. 1234 »).
export function distinctProductName(item: Labelled, index: ReturnType<typeof homonymIndex>) {
  const entry = index.get(normalizeProductName(item.name));
  if (!entry) return item.name;
  const detail = entry.unitsDiffer && item.unit ? unitLabel(item.unit) : item.sku ? `réf. ${item.sku}` : unitLabel(item.unit);
  return detail ? `${item.name} — ${detail}` : item.name;
}

// Ligne de vente / reçu : le serveur indique si un autre produit de la boutique porte le même
// nom (has_homonym, get_sale_detail_safe) — on ajoute alors l'unité, ou la référence.
export function saleItemName(item: { product?: { name: string; sku?: string | null; unit?: string | null; has_homonym?: boolean } | null; variant?: { name: string } | null }) {
  const product = item.product;
  const base = product?.name ?? 'Produit';
  const detail = product?.has_homonym ? (product.unit ? unitLabel(product.unit) : product.sku ? `réf. ${product.sku}` : '') : '';
  const named = detail ? `${base} — ${detail}` : base;
  return item.variant ? `${named} - ${item.variant.name}` : named;
}
