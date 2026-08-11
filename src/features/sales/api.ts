import { supabase } from '@/services/supabase/client';
import type { CartItem } from '@/stores/saleCart';
import type { Sale, SaleStockItem } from '@/types/database';
import { createOperationId } from '@/utils/operationId';

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export const SALE_PAGE_SIZE = 30;

export async function getSales(companyId: string, storeId: string, page = 0, withFinancials = false): Promise<Sale[]> {
  const start = page * SALE_PAGE_SIZE;
  const { data, error } = await supabase
    .from('sales')
    .select('id,company_id,store_id,customer_id,reference,subtotal,discount_total,total,amount_paid,amount_due,payment_status,currency_code,secondary_currency_code,secondary_exchange_rate,exchange_rate_effective_at,payment_method,created_by,created_at,store:stores(name),creator:profiles!sales_created_by_fkey(full_name)')
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .range(start, start + SALE_PAGE_SIZE - 1);
  fail(error);
  const sales = (data ?? []) as unknown as Sale[];
  if (withFinancials && sales.length) {
    const { data: fin } = await supabase
      .from('sale_financials')
      .select('sale_id,cost_total,gross_profit')
      .in('sale_id', sales.map((sale) => sale.id));
    const map = new Map((fin ?? []).map((row) => [(row as { sale_id: string }).sale_id, row as { cost_total: number; gross_profit: number }]));
    for (const sale of sales) {
      const row = map.get(sale.id);
      sale.cost_total = Number(row?.cost_total ?? 0);
      sale.gross_profit = Number(row?.gross_profit ?? 0);
    }
  }
  return sales;
}

export async function getSale(id: string, withFinancials = false): Promise<Sale> {
  const { data, error } = await supabase.from('sales').select('id,company_id,store_id,customer_id,reference,subtotal,discount_total,total,amount_paid,amount_due,payment_status,currency_code,secondary_currency_code,secondary_exchange_rate,exchange_rate_effective_at,payment_method,created_by,created_at,store:stores(name),creator:profiles!sales_created_by_fkey(full_name),sale_items(id,sale_id,product_id,product_variant_id,sale_price,quantity,discount,line_total,product:products(name,sku),variant:product_variants(name,sku))').eq('id', id).single();
  fail(error);
  const sale = data as unknown as Sale;
  if (withFinancials) {
    const [{ data: fin }, { data: itemFin }] = await Promise.all([
      supabase.from('sale_financials').select('cost_total,gross_profit').eq('sale_id', id).maybeSingle(),
      supabase.from('sale_item_financials').select('sale_item_id,purchase_price_snapshot,gross_profit').eq('sale_id', id),
    ]);
    sale.cost_total = Number((fin as { cost_total?: number } | null)?.cost_total ?? 0);
    sale.gross_profit = Number((fin as { gross_profit?: number } | null)?.gross_profit ?? 0);
    const map = new Map((itemFin ?? []).map((row) => [(row as { sale_item_id: string }).sale_item_id, row as { purchase_price_snapshot: number; gross_profit: number }]));
    for (const item of sale.sale_items ?? []) {
      const row = map.get(item.id);
      item.purchase_price_snapshot = Number(row?.purchase_price_snapshot ?? 0);
      item.gross_profit = Number(row?.gross_profit ?? 0);
    }
  }
  return sale;
}

export async function getSaleStock(companyId: string, storeId: string, includeCost = true): Promise<SaleStockItem[]> {
  const productColumns = includeCost
    ? 'id,category_id,unit,name,sku,sale_price,purchase_price,image_urls,is_active,category:categories(name),product_variants(id,name,sku,sale_price,purchase_price,is_active)'
    : 'id,category_id,unit,name,sku,sale_price,image_urls,is_active,category:categories(name),product_variants(id,name,sku,sale_price,is_active)';
  const [levelsResult, productsResult] = await Promise.all([
    supabase.from('stock_levels').select('id,product_id,product_variant_id,quantity').eq('company_id', companyId).eq('store_id', storeId),
    supabase.from('products').select(productColumns).eq('company_id', companyId).eq('store_id',storeId).eq('is_active', true).order('name'),
  ]);
  fail(levelsResult.error);
  fail(productsResult.error);
  const levels = (levelsResult.data ?? []) as { id: string; product_id: string; product_variant_id: string | null; quantity: number }[];
  const levelFor = (productId: string, variantId: string | null) => levels.find((row) => row.product_id === productId && row.product_variant_id === variantId);

  return ((productsResult.data ?? []) as unknown as {
    id: string; category_id:string|null; category:{name:string}|null; unit:'piece'|'carton'|'kg'|'litre'|'sac'|'paquet'; name: string; sku: string; sale_price: number; purchase_price?: number; image_urls: string[];
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
        categoryId: product.category_id,
        categoryName: product.category?.name ?? null,
        unit: product.unit,
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
  customerId: string | null = null,
  amountPaid: number | null = null,
  operationId = createOperationId(),
): Promise<{ saleId: string; reference: string; total: number; grossProfit: number; amountPaid:number; amountDue:number; paymentStatus:string }> {
  if (!storeId) throw new Error('Sélectionnez une boutique avant de valider la vente.');
  if (!items.length) throw new Error('Ajoutez au moins un produit au panier.');
  if (items.some((item) => !Number.isFinite(item.quantity) || item.quantity <= 0)) {
    throw new Error('Toutes les quantités doivent être supérieures à zéro.');
  }
  if (items.some((item) => item.quantity > item.available)) {
    throw new Error('Le stock disponible est insuffisant pour un ou plusieurs produits.');
  }
  const { data, error } = await supabase.rpc('create_sale_v2', {
    p_store_id: storeId,
    p_payment_method: paymentMethod,
    p_items: items.map((item) => ({ productId: item.productId, variantId: item.variantId, quantity: item.quantity, discount: item.discount })),
    p_customer_id: customerId,
    p_amount_paid: amountPaid,
    p_operation_id: operationId,
  });
  fail(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('La vente n’a pas été créée.');
  return { saleId: row.sale_id, reference: row.reference, total: Number(row.total), grossProfit: Number(row.gross_profit), amountPaid:Number(row.amount_paid), amountDue:Number(row.amount_due), paymentStatus:String(row.payment_status) };
}
