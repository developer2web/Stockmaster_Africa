import { supabase } from '@/services/supabase/client';
import type { CategoryInput, ProductInput, SupplierInput, VariantInput } from '@/schemas/catalog';
import type { Category, Product, Supplier } from '@/types/database';
import { userErrorMessage } from '@/utils/errors';
import { parseDecimal } from '@/utils/number';
import { createOperationId } from '@/utils/operationId';
import { withOfflineCache } from '@/features/offline/storage';

function fail(error: { message: string } | null) {
  if (error) throw new Error(userErrorMessage(error));
}

const empty = (value?: string) => value?.trim() || null;

export async function getCategories(companyId: string, storeId: string): Promise<Category[]> {
  return withOfflineCache(`categories:${companyId}:${storeId}`, async () => {
  const { data, error } = await supabase
    .from('categories')
    .select('id,company_id,store_id,name,description,is_active,created_at')
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .order('name')
    .limit(250);
  fail(error);
  return (data ?? []) as Category[];
  });
}

export async function saveCategory(companyId: string, storeId: string, value: CategoryInput, id?: string) {
  const payload = {
    company_id: companyId,
    store_id: storeId,
    name: value.name,
    description: empty(value.description),
    is_active: value.isActive,
  };
  const { error } = await (id
    ? supabase.from('categories').update(payload).eq('id', id)
    : supabase.from('categories').insert(payload));
  fail(error);
}

export async function getSuppliers(companyId: string, storeId: string): Promise<Supplier[]> {
  return withOfflineCache(`suppliers:${companyId}:${storeId}`, async () => {
  const { data, error } = await supabase
    .from('suppliers')
    .select('id,company_id,store_id,name,email,phone,address,is_active,created_at')
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .order('name')
    .limit(250);
  fail(error);
  return (data ?? []) as Supplier[];
  });
}

export async function saveSupplier(companyId: string, storeId: string, value: SupplierInput, id?: string) {
  const payload = {
    company_id: companyId,
    store_id: storeId,
    name: value.name,
    email: empty(value.email),
    phone: empty(value.phone),
    address: empty(value.address),
    is_active: value.isActive,
  };
  const { error } = await (id
    ? supabase.from('suppliers').update(payload).eq('id', id)
    : supabase.from('suppliers').insert(payload));
  fail(error);
}
export async function getSupplierStats(companyId:string,storeId:string){const{data,error}=await supabase.from('purchases').select('supplier_id,total,amount_due,created_at').eq('company_id',companyId).eq('store_id',storeId).order('created_at',{ascending:false}).limit(1000);fail(error);const result:Record<string,{total:number;due:number;lastDelivery:string|null;count:number}>={};for(const row of data??[]){if(!row.supplier_id)continue;const current=result[row.supplier_id]??{total:0,due:0,lastDelivery:null,count:0};current.total+=Number(row.total);current.due+=Number(row.amount_due);current.count+=1;current.lastDelivery??=row.created_at;result[row.supplier_id]=current}return result}

export const PRODUCT_PAGE_SIZE = 30;

export async function getProducts(
  companyId: string,
  storeId: string,
  search = '',
  page = 0,
): Promise<Product[]> {
  return withOfflineCache(`products:${companyId}:${storeId}:${search.trim().toLowerCase()}:${page}`, async () => {
  const start = page * PRODUCT_PAGE_SIZE;
  let query = supabase
    .from('products')
    .select('id,company_id,store_id,category_id,supplier_id,name,description,sku,qr_code,barcode,unit,purchase_price,sale_price,low_stock_threshold,image_url,image_urls,is_active,created_at,category:categories(name),supplier:suppliers(name)')
    .eq('company_id', companyId)
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .range(start, start + PRODUCT_PAGE_SIZE - 1);
  if (search.trim()) {
    const safeSearch = search.trim().replaceAll(',', ' ');
    query = query.or(`name.ilike.%${safeSearch}%,sku.ilike.%${safeSearch}%,barcode.ilike.%${safeSearch}%`);
  }
  const { data, error } = await query;
  fail(error);
  return (data ?? []) as unknown as Product[];
  });
}
export async function getProduct(id:string):Promise<Product>{const{data,error}=await supabase.from('products').select('id,company_id,store_id,category_id,supplier_id,name,description,sku,qr_code,barcode,unit,purchase_price,sale_price,low_stock_threshold,image_url,image_urls,is_active,created_at,category:categories(name),supplier:suppliers(name),product_variants(id,product_id,name,sku,barcode,attributes,purchase_price,sale_price,is_active)').eq('id',id).single();fail(error);return data as unknown as Product}
export async function saveProduct(companyId:string,storeId:string,v:ProductInput,id?:string):Promise<string>{const payload={company_id:companyId,store_id:storeId,name:v.name,description:empty(v.description),sku:v.sku,barcode:empty(v.barcode),category_id:v.categoryId,supplier_id:v.supplierId,unit:v.unit,purchase_price:parseDecimal(v.purchasePrice),sale_price:parseDecimal(v.salePrice),low_stock_threshold:parseDecimal(v.lowStockThreshold),is_active:v.isActive};if(id){const{error}=await supabase.from('products').update(payload).eq('id',id);fail(error);return id}const{data,error}=await supabase.rpc('create_product_with_initial_stock',{p_store_id:storeId,p_name:v.name,p_description:v.description,p_sku:v.sku,p_barcode:v.barcode,p_category_id:v.categoryId,p_supplier_id:v.supplierId,p_unit:v.unit,p_purchase_price:parseDecimal(v.purchasePrice),p_sale_price:parseDecimal(v.salePrice),p_low_stock_threshold:parseDecimal(v.lowStockThreshold),p_is_active:v.isActive,p_initial_quantity:parseDecimal(v.initialQuantity),p_operation_id:createOperationId()});fail(error);if(!data)throw new Error('Le produit n’a pas été créé.');return data as string}
export async function deleteProduct(id:string){const{error}=await supabase.from('products').delete().eq('id',id);fail(error)}
export async function saveVariant(companyId:string,productId:string,v:VariantInput,id?:string){const payload={company_id:companyId,product_id:productId,name:v.name,sku:v.sku,barcode:empty(v.barcode),purchase_price:v.purchasePrice===''?null:parseDecimal(v.purchasePrice),sale_price:v.salePrice===''?null:parseDecimal(v.salePrice),is_active:v.isActive};const{error}=await(id?supabase.from('product_variants').update(payload).eq('id',id):supabase.from('product_variants').insert(payload));fail(error)}
export async function deleteVariant(id:string){const{error}=await supabase.from('product_variants').delete().eq('id',id);fail(error)}
