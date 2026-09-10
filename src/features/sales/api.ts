import { supabase } from '@/services/supabase/client';
import type { CartItem } from '@/stores/saleCart';
import type { Sale, SaleStockItem } from '@/types/database';
import { createOperationId } from '@/utils/operationId';
import { isDeviceOffline } from '@/features/offline/connectivity';
import { enqueueOfflineOperation } from '@/features/offline/queue';
import { withOfflineCache } from '@/features/offline/storage';
import { createOfflineMetadata } from '@/features/offline/device';

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export const SALE_PAGE_SIZE = 30;

export async function getSales(companyId: string, storeId: string, page = 0, withFinancials = false): Promise<Sale[]> {
  return withOfflineCache(`sales:${companyId}:${storeId}:${page}:${withFinancials}`, async () => {
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
  }, Array.isArray);
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
    ? 'id,unit,name,sku,barcode,qr_code,sale_price,purchase_price,image_urls,is_active,product_variants(id,name,sku,barcode,sale_price,purchase_price,is_active)'
    : 'id,unit,name,sku,barcode,qr_code,sale_price,image_urls,is_active,product_variants(id,name,sku,barcode,sale_price,is_active)';
  const pageSize=1000;
  const loadLevels=async()=>{
    const rows:{id:string;product_id:string;product_variant_id:string|null;quantity:number}[]=[];
    for(let from=0;;from+=pageSize){
      const {data,error}=await supabase.from('stock_levels').select('id,product_id,product_variant_id,quantity').eq('company_id',companyId).eq('store_id',storeId).range(from,from+pageSize-1);
      fail(error);const page=(data??[]) as typeof rows;rows.push(...page);if(page.length<pageSize)break;
    }
    return rows;
  };
  const loadProducts=async()=>{
    const rows:unknown[]=[];
    for(let from=0;;from+=pageSize){
      const {data,error}=await supabase.from('products').select(productColumns).eq('company_id',companyId).eq('store_id',storeId).eq('is_active',true).order('name').range(from,from+pageSize-1);
      fail(error);const page=data??[];rows.push(...page);if(page.length<pageSize)break;
    }
    return rows;
  };
  const [levels,productRows]=await Promise.all([loadLevels(),loadProducts()]);
  const levelMap=new Map(levels.map(row=>[`${row.product_id}:${row.product_variant_id??''}`,row]));
  const levelFor = (productId: string, variantId: string | null) => levelMap.get(`${productId}:${variantId??''}`);

  return (productRows as {
    id: string; unit:'piece'|'carton'|'kg'|'litre'|'sac'|'paquet'; name: string; sku: string; barcode:string|null;qr_code:string; sale_price: number; purchase_price?: number; image_urls: string[];
    product_variants: { id: string; name: string; sku: string; barcode:string|null; sale_price: number | null; purchase_price?: number | null; is_active: boolean }[];
  }[]).flatMap((product) => {
    const variants = (product.product_variants ?? []).filter((variant) => variant.is_active);
    const entries = variants.length ? variants : [null];
    return entries.map((variant) => {
      const level = levelFor(product.id, variant?.id ?? null);
      return {
        stockLevelId: level?.id ?? '',
        productId: product.id,
        variantId: variant?.id ?? null,
        unit: product.unit,
        name: variant ? `${product.name} • ${variant.name}` : product.name,
        sku: variant?.sku ?? product.sku,
        lookupCodes: [variant?.sku, variant?.barcode, product.sku, product.barcode, product.qr_code].filter((value): value is string => !!value),
        salePrice: Number(variant?.sale_price ?? product.sale_price),
        purchasePrice: includeCost ? Number(variant?.purchase_price ?? product.purchase_price ?? 0) : 0,
        available: Number(level?.quantity ?? 0),
        imageUrl: product.image_urls?.[0] ?? null,
      };
    });
  });
  }, Array.isArray);
}

export async function createSale(
  _companyId: string,
  storeId: string,
  paymentMethod: string,
  items: CartItem[],
  customerId: string | null = null,
  amountPaid: number | null = null,
  operationId = createOperationId(),
  allowNegativeStock = false,
  expectedTotal: number | null = null,
): Promise<{ saleId: string; reference: string; total: number; grossProfit: number; amountPaid:number; amountDue:number; paymentStatus:string; queued?: boolean }> {
  if (!storeId) throw new Error('Sélectionnez une boutique avant de valider la vente.');
  if (!items.length) throw new Error('Ajoutez au moins un produit au panier.');
  if (items.some((item) => !Number.isFinite(item.quantity) || item.quantity <= 0)) {
    throw new Error('Toutes les quantités doivent être supérieures à zéro.');
  }
  if (!allowNegativeStock && items.some((item) => item.quantity > item.available)) {
    throw new Error('Le stock disponible est insuffisant pour un ou plusieurs produits.');
  }
  const payload = {
    p_store_id: storeId,
    p_payment_method: paymentMethod,
    p_items: items.map((item, index) => ({
      productId: item.productId,
      variantId: item.variantId,
      quantity: item.quantity,
      discount: item.discount,
      unitPrice: item.salePrice,
      ...(index === 0 && expectedTotal !== null ? { expectedTotal } : {}),
    })),
    p_customer_id: customerId,
    p_amount_paid: amountPaid,
    p_operation_id: operationId,
  };
  if (await isDeviceOffline()) {
    const metadata=await createOfflineMetadata();
    await enqueueOfflineOperation({ id: operationId, type: 'sale', createdAt:metadata.createdAt,deviceId:metadata.deviceId,payload:{...payload,p_offline_created_at:metadata.createdAt,p_offline_device_id:metadata.deviceId} });
    const total = expectedTotal ?? items.reduce((sum, item) => sum + item.salePrice * item.quantity - item.discount, 0);
    const paid = amountPaid ?? total;
    return { saleId: operationId, reference: `HORS-LIGNE-${operationId.slice(-8).toUpperCase()}`, total, grossProfit: 0, amountPaid: paid, amountDue: Math.max(0, total - paid), paymentStatus: paid >= total ? 'paid' : paid > 0 ? 'partial' : 'credit', queued: true };
  }
  const { data, error } = await supabase.rpc('create_sale_v3', {...payload,p_offline_created_at:null,p_offline_device_id:null});
  fail(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('La vente n’a pas été créée.');
  return { saleId: row.sale_id, reference: row.reference, total: Number(row.total), grossProfit: Number(row.gross_profit), amountPaid:Number(row.amount_paid), amountDue:Number(row.amount_due), paymentStatus:String(row.payment_status) };
}
