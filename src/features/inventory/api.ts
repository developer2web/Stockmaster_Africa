import { supabase } from '@/services/supabase/client';
import type { SaleStockItem, StockLevel, StockMovement } from '@/types/database';
import type { StockMovementInput } from '@/schemas/inventory';
import { createOperationId } from '@/utils/operationId';
import { parseDecimal } from '@/utils/number';
import { readOfflineCache, withOfflineCache } from '@/features/offline/storage';
import { readProductCosts } from '@/features/products/costs';

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export type ProductCodeLookup = {
  productId: string;
  variantId: string | null;
  productName: string | null;
  storeId: string;
  storeName: string | null;
  isActive: boolean;
};

async function lookupCompanyProductCode(code: string, companyId: string): Promise<ProductCodeLookup | null> {
  const normalized = code.trim();
  const productColumns = 'id,name,store_id,is_active,store:stores(name)';
  const productResults=await Promise.all((['barcode','qr_code','sku'] as const).map(column=>supabase.from('products').select(productColumns).eq('company_id',companyId).eq(column,normalized).limit(1).maybeSingle()));
  for (const {data,error} of productResults) {
    fail(error);
    if (data) {
      const row = data as unknown as { id:string;name:string;store_id:string;is_active:boolean;store:{name:string}|null };
      return { productId:row.id,variantId:null,productName:row.name,storeId:row.store_id,storeName:row.store?.name??null,isActive:row.is_active };
    }
  }
  const variantResults=await Promise.all((['barcode','sku'] as const).map(column=>supabase.from('product_variants').select('id,product_id,is_active,product:products!inner(id,name,company_id,store_id,is_active,store:stores(name))').eq('company_id',companyId).eq(column,normalized).limit(1).maybeSingle()));
  for (const {data,error} of variantResults) {
    fail(error);
    if (data) {
      const row = data as unknown as { id:string;product_id:string;is_active:boolean;product:{name:string;store_id:string;is_active:boolean;store:{name:string}|null} };
      return { productId:row.product_id,variantId:row.id,productName:row.product.name,storeId:row.product.store_id,storeName:row.product.store?.name??null,isActive:row.is_active&&row.product.is_active };
    }
  }
  return null;
}

export async function lookupProductCode(
  code: string,
  storeId: string,
  companyId?: string,
): Promise<ProductCodeLookup | null> {
  const { data, error } = await supabase.rpc('lookup_product_code', {
    p_code: code.trim(),
    p_store_id: storeId,
  });
  if (error) {
    if (!companyId) fail(error);
    const cached = await readOfflineCache<SaleStockItem[]>(`sale-stock:${companyId}:${storeId}:true`, Array.isArray)
      ?? await readOfflineCache<SaleStockItem[]>(`sale-stock:${companyId}:${storeId}:false`, Array.isArray);
    const normalized = code.trim().toLowerCase();
    const found = cached?.find((item) => item.lookupCodes?.some((value) => value.trim().toLowerCase() === normalized));
    if (found) return { productId: found.productId, variantId: found.variantId, productName:found.name, storeId, storeName:null, isActive:true };
    fail(error);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (row) return { productId: row.product_id, variantId: row.variant_id ?? null, productName:null, storeId, storeName:null, isActive:true };
  return companyId ? lookupCompanyProductCode(code, companyId) : null;
}

export async function getStockLevels(
  companyId: string,
  productId?: string,
  storeId?: string,
  includeCost = false,
): Promise<StockLevel[]> {
  // Keep read-only quantities separate from previously cached purchase prices.
  return withOfflineCache(`stock-levels:${companyId}:${productId??'all'}:${storeId??'all'}:cost:${includeCost}`, async () => {
  const productColumns = 'name,sku,sale_price';
  let query = supabase
    .from('stock_levels')
    .select(`id,company_id,store_id,product_id,product_variant_id,quantity,updated_at,store:stores(name),product:products(${productColumns}),variant:product_variants(name,sku)`)
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false })
    .limit(500);
  if (productId) query = query.eq('product_id', productId);
  if (storeId) query = query.eq('store_id', storeId);
  const { data, error } = await query;
  fail(error);
  const rows = (data ?? []) as unknown as StockLevel[];
  if (includeCost) {
    const { products: costs } = await readProductCosts(rows.map(row => row.product_id));
    for (const row of rows) {
      if (row.product && costs.has(row.product_id)) row.product.purchase_price = costs.get(row.product_id);
    }
  }
  return rows;
  }, Array.isArray);
}

export async function getStockMovements(
  companyId: string,
  productId?: string,
  storeId?: string,
): Promise<StockMovement[]> {
  return withOfflineCache(`stock-movements:${companyId}:${productId??'all'}:${storeId??'all'}`, async () => {
  let query = supabase
    .from('stock_movements')
    .select('id,company_id,store_id,product_id,product_variant_id,quantity,previous_quantity,new_quantity,movement_type,note,created_at,store:stores(name),product:products(name,sku),variant:product_variants(name,sku)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (productId) query = query.eq('product_id', productId);
  if (storeId) query = query.eq('store_id', storeId);
  const { data, error } = await query;
  fail(error);
  return (data ?? []) as unknown as StockMovement[];
  }, Array.isArray);
}

export async function recordStockMovement(
  productId: string,
  values: StockMovementInput,
  operationId = createOperationId(),
): Promise<number> {
  const delta = parseDecimal(values.quantity) * (values.direction === 'out' ? -1 : 1);
  const { data, error } = await supabase.rpc('record_stock_movement', {
    p_product_id: productId,
    p_store_id: values.storeId,
    p_delta: delta,
    p_movement_type: values.direction === 'out' ? 'adjustment_out' : 'adjustment_in',
    p_note: values.note || null,
    p_variant_id: values.variantId,
    p_operation_id: operationId,
  });
  fail(error);
  const row = Array.isArray(data) ? data[0] : data;
  return Number(row?.new_quantity ?? 0);
}

export type InventoryCount={id:string;status:string;note:string|null;created_at:string;inventory_items:{id:string;product_id:string;product_variant_id:string|null;expected_quantity:number;counted_quantity:number|null;difference:number|null;product:{name:string;sku:string}|null;variant:{name:string;sku:string}|null}[]};
export async function startInventory(storeId:string,note=''){const{data,error}=await supabase.rpc('start_store_inventory',{p_store_id:storeId,p_note:note.trim()||null});fail(error);return data as string;}
export async function getInventory(id:string):Promise<InventoryCount>{const{data,error}=await supabase.from('inventories').select('id,status,note,created_at,inventory_items(id,product_id,product_variant_id,expected_quantity,counted_quantity,difference,product:products(name,sku),variant:product_variants(name,sku))').eq('id',id).single();fail(error);return data as unknown as InventoryCount;}
export async function finalizeInventory(id:string,counts:{itemId:string;countedQuantity:number}[]){const{error}=await supabase.rpc('finalize_store_inventory',{p_inventory_id:id,p_counts:counts});fail(error);}
