import { supabase } from '@/services/supabase/client';
import type { CartItem } from '@/stores/saleCart';
import type { Sale, SaleStockItem } from '@/types/database';
import { createOperationId } from '@/utils/operationId';

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export const SALE_PAGE_SIZE = 30;

export async function getSales(companyId: string, storeId: string, page = 0): Promise<Sale[]> {
  const start = page * SALE_PAGE_SIZE;
  const { data, error } = await supabase
    .from('sales')
    .select('id,company_id,store_id,customer_id,reference,subtotal,discount_total,total,cost_total,gross_profit,currency_code,secondary_currency_code,secondary_exchange_rate,exchange_rate_effective_at,payment_method,created_by,created_at,store:stores(name),creator:profiles!sales_created_by_fkey(full_name)')
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .range(start, start + SALE_PAGE_SIZE - 1);
  fail(error);
  return (data ?? []) as unknown as Sale[];
}

export async function getSale(id: string): Promise<Sale> {
  const { data, error } = await supabase.from('sales').select('id,company_id,store_id,customer_id,reference,subtotal,discount_total,total,cost_total,gross_profit,currency_code,secondary_currency_code,secondary_exchange_rate,exchange_rate_effective_at,payment_method,created_by,created_at,store:stores(name),creator:profiles!sales_created_by_fkey(full_name),sale_items(id,sale_id,product_id,product_variant_id,purchase_price_snapshot,sale_price,quantity,discount,gross_profit,line_total,product:products(name,sku),variant:product_variants(name,sku))').eq('id', id).single();
  fail(error);
  return data as unknown as Sale;
}

export async function getSaleStock(companyId: string, storeId: string, includeCost = true): Promise<SaleStockItem[]> {
  const productColumns = includeCost
    ? 'id,name,sku,sale_price,purchase_price,image_urls,is_active,product_variants(id,name,sku,sale_price,purchase_price,is_active)'
    : 'id,name,sku,sale_price,image_urls,is_active,product_variants(id,name,sku,sale_price,is_active)';
  const [levelsResult, productsResult] = await Promise.all([
    supabase.from('stock_levels').select('id,product_id,product_variant_id,quantity').eq('company_id', companyId).eq('store_id', storeId),
    supabase.from('products').select(productColumns).eq('company_id', companyId).eq('store_id',storeId).eq('is_active', true).order('name'),
  ]);
  fail(levelsResult.error);
  fail(productsResult.error);
  const levels = (levelsResult.data ?? []) as { id: string; product_id: string; product_variant_id: string | null; quantity: number }[];
  const levelFor = (productId: string, variantId: string | null) => levels.find((row) => row.product_id === productId && row.product_variant_id === variantId);

  return ((productsResult.data ?? []) as unknown as {
    id: string; name: string; sku: string; sale_price: number; purchase_price?: number; image_urls: string[];
    product_variants: { id: string; name: string; sku: string; sale_price: number | null; purchase_price?: number | null; is_active: boolean }[];
  }[]).flatMap((product) => {
    const variants = (product.product_variants ?? []).filter((variant) => variant.is_active);
    const entries = variants.length ? variants : [null];
    return entries.map((variant) => {
      const level = levelFor(product.id, variant?.id ?? null);
      return {
        stockLevelId: level?.id ?? '',
        productId: product.id,
        variantId: variant?.id ?? null,
        name: variant ? `${product.name} • ${variant.name}` : product.name,
        sku: variant?.sku ?? product.sku,
        salePrice: Number(variant?.sale_price ?? product.sale_price),
        purchasePrice: includeCost ? Number(variant?.purchase_price ?? product.purchase_price ?? 0) : 0,
        available: Number(level?.quantity ?? 0),
        imageUrl: product.image_urls?.[0] ?? null,
      };
    });
  });
}

export async function createSale(
  storeId: string,
  paymentMethod: string,
  items: CartItem[],
  operationId = createOperationId(),
): Promise<{ saleId: string; reference: string; total: number; grossProfit: number }> {
  if (!storeId) throw new Error('Sélectionnez une boutique avant de valider la vente.');
  if (!items.length) throw new Error('Ajoutez au moins un produit au panier.');
  if (items.some((item) => !Number.isFinite(item.quantity) || item.quantity <= 0)) {
    throw new Error('Toutes les quantités doivent être supérieures à zéro.');
  }
  if (items.some((item) => item.quantity > item.available)) {
    throw new Error('Le stock disponible est insuffisant pour un ou plusieurs produits.');
  }
  const { data, error } = await supabase.rpc('create_sale', {
    p_store_id: storeId,
    p_payment_method: paymentMethod,
    p_items: items.map((item) => ({ productId: item.productId, variantId: item.variantId, quantity: item.quantity, discount: 0 })),
    p_customer_id: null,
    p_operation_id: operationId,
  });
  fail(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('La vente n’a pas été créée.');
  return { saleId: row.sale_id, reference: row.reference, total: Number(row.total), grossProfit: Number(row.gross_profit) };
}
