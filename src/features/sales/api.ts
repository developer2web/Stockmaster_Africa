import { supabase } from '@/services/supabase/client';
import type { CartItem } from '@/stores/saleCart';
import type { Sale, SaleStockItem } from '@/types/database';
import { createOperationId } from '@/utils/operationId';
import { isDeviceOffline } from '@/features/offline/connectivity';
import { enqueueOfflineOperation } from '@/features/offline/queue';
import { withOfflineCache } from '@/features/offline/storage';

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export const SALE_PAGE_SIZE = 30;

export async function getSales(companyId: string, storeId: string, page = 0, withFinancials = false): Promise<Sale[]> {
  const start = page * SALE_PAGE_SIZE;
  const { data, error } = await supabase.rpc('get_sales_history_safe',{
    p_company_id:companyId,p_store_id:storeId,p_offset:start,p_limit:SALE_PAGE_SIZE,
  });
  fail(error);
  const sales = (Array.isArray(data)?data:[]) as unknown as Sale[];
  if (withFinancials && sales.length) {
    const { data: fin,error:finError } = await supabase
      .from('sale_financials')
      .select('sale_id,cost_total,gross_profit')
      .in('sale_id', sales.map((sale) => sale.id));
    fail(finError);
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
  const { data, error } = await supabase.rpc('get_sale_detail_safe',{p_sale_id:id});
  fail(error);
  if(!data)throw new Error('Vente introuvable ou accès refusé.');
  const sale = data as unknown as Sale;
  if (withFinancials) {
    const [{ data: fin,error:finError }, { data: itemFin,error:itemFinError }] = await Promise.all([
      supabase.from('sale_financials').select('cost_total,gross_profit').eq('sale_id', id).maybeSingle(),
      supabase.from('sale_item_financials').select('sale_item_id,purchase_price_snapshot,gross_profit').eq('sale_id', id),
    ]);
    fail(finError);fail(itemFinError);
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
  return withOfflineCache(`sale-stock:${companyId}:${storeId}:${includeCost}`, async () => {
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
  });
}

export async function createSale(
  _companyId: string,
  storeId: string,
  paymentMethod: string,
  items: CartItem[],
  customerId: string | null = null,
  amountPaid: number | null = null,
  operationId = createOperationId(),
): Promise<{ saleId: string; reference: string; total: number; grossProfit: number; amountPaid:number; amountDue:number; paymentStatus:string; queued?: boolean }> {
  if (!storeId) throw new Error('Sélectionnez une boutique avant de valider la vente.');
  if (!items.length) throw new Error('Ajoutez au moins un produit au panier.');
  if (items.some((item) => !Number.isFinite(item.quantity) || item.quantity <= 0)) {
    throw new Error('Toutes les quantités doivent être supérieures à zéro.');
  }
  if (items.some((item) => item.quantity > item.available)) {
    throw new Error('Le stock disponible est insuffisant pour un ou plusieurs produits.');
  }
  const payload = {
    p_store_id: storeId,
    p_payment_method: paymentMethod,
    p_items: items.map((item) => ({ productId: item.productId, variantId: item.variantId, quantity: item.quantity, discount: item.discount })),
    p_customer_id: customerId,
    p_amount_paid: amountPaid,
    p_operation_id: operationId,
  };
  if (await isDeviceOffline()) {
    await enqueueOfflineOperation({ id: operationId, type: 'sale', payload });
    const total = items.reduce((sum, item) => sum + item.salePrice * item.quantity - item.discount, 0);
    const paid = amountPaid ?? total;
    return { saleId: operationId, reference: `HORS-LIGNE-${operationId.slice(-8).toUpperCase()}`, total, grossProfit: 0, amountPaid: paid, amountDue: Math.max(0, total - paid), paymentStatus: paid >= total ? 'paid' : paid > 0 ? 'partial' : 'due', queued: true };
  }
  const { data, error } = await supabase.rpc('create_sale_v2', payload);
  fail(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('La vente n’a pas été créée.');
  return { saleId: row.sale_id, reference: row.reference, total: Number(row.total), grossProfit: Number(row.gross_profit), amountPaid:Number(row.amount_paid), amountDue:Number(row.amount_due), paymentStatus:String(row.payment_status) };
}
