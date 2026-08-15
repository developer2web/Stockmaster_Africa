import { supabase } from '@/services/supabase/client';
import type { StockLevel, StockMovement } from '@/types/database';
import type { StockMovementInput } from '@/schemas/inventory';
import { createOperationId } from '@/utils/operationId';
import { parseDecimal } from '@/utils/number';

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function lookupProductCode(
  code: string,
  storeId: string,
): Promise<{ productId: string; variantId: string | null } | null> {
  const { data, error } = await supabase.rpc('lookup_product_code', {
    p_code: code.trim(),
    p_store_id: storeId,
  });
  fail(error);
  const row = Array.isArray(data) ? data[0] : data;
  return row ? { productId: row.product_id, variantId: row.variant_id ?? null } : null;
}

export async function getStockLevels(
  companyId: string,
  productId?: string,
  storeId?: string,
): Promise<StockLevel[]> {
  let query = supabase
    .from('stock_levels')
    .select('id,company_id,store_id,product_id,product_variant_id,quantity,updated_at,store:stores(name),product:products(name,sku,purchase_price,sale_price),variant:product_variants(name,sku)')
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false })
    .limit(500);
  if (productId) query = query.eq('product_id', productId);
  if (storeId) query = query.eq('store_id', storeId);
  const { data, error } = await query;
  fail(error);
  return (data ?? []) as unknown as StockLevel[];
}

export async function getStockMovements(
  companyId: string,
  productId?: string,
  storeId?: string,
): Promise<StockMovement[]> {
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
