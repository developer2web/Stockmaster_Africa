import { supabase } from '@/services/supabase/client';
import { fetchAllRows } from '@/services/supabase/pagination';

/** Costs are read through server-authorized views, never base-table columns. */
export async function readProductCosts(productIds: string[], includeVariants = false) {
  const products = new Map<string, number>();
  const variants = new Map<string, number | null>();
  const ids = [...new Set(productIds)];
  for (let start = 0; start < ids.length; start += 100) {
    const batch = ids.slice(start, start + 100);
    const [productRows, variantRows] = await Promise.all([
      fetchAllRows((from, to) => supabase.from('product_costs')
        .select('product_id,purchase_price').in('product_id', batch).order('product_id').range(from, to)),
      includeVariants
        ? fetchAllRows((from, to) => supabase.from('product_variant_costs')
          .select('product_variant_id,purchase_price').in('product_id', batch).order('product_variant_id').range(from, to))
        : Promise.resolve([]),
    ]);
    for (const row of productRows) products.set(row.product_id, Number(row.purchase_price));
    for (const row of variantRows) variants.set(row.product_variant_id, row.purchase_price == null ? null : Number(row.purchase_price));
  }
  return { products, variants };
}
