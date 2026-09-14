// Recherche approximative d'un produit par code-barres via Open Food Facts
// (base publique, gratuite, sans clé). Sert uniquement à pré-remplir le nom
// (et l'image, à titre de référence visuelle) après un scan sans résultat
// dans le catalogue StockMaster — jamais les prix ni le stock, qui restent
// propres à chaque entreprise. Une absence de résultat ou une erreur réseau
// laisse simplement le champ vide : la saisie manuelle reste le chemin normal.
export type OpenFoodFactsMatch = { name: string; imageUrl: string | null; brand: string | null };

export async function lookupOpenFoodFacts(barcode: string): Promise<OpenFoodFactsMatch | null> {
  if (!/^\d{8,14}$/.test(barcode)) return null;
  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,product_name_fr,brands,image_front_url,image_url`,
      { signal: AbortSignal.timeout(6000) },
    );
    if (!response.ok) return null;
    const payload = await response.json() as { status?: number; product?: Record<string, unknown> };
    if (payload.status !== 1 || !payload.product) return null;
    const name = String(payload.product.product_name_fr || payload.product.product_name || '').trim();
    if (!name) return null;
    return {
      name,
      imageUrl: (payload.product.image_front_url as string) || (payload.product.image_url as string) || null,
      brand: (payload.product.brands as string) || null,
    };
  } catch {
    return null;
  }
}
