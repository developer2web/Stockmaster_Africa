import { supabase } from '@/services/supabase/client';
import { userErrorMessage } from '@/utils/errors';

export type AdminOverview = {
  products: number;
  stockQuantity: number;
  purchaseValue: number;
  expectedRevenue: number;
};

export async function getAdminOverview(companyId: string, storeId: string): Promise<AdminOverview> {
  const [productsResult, stockResult] = await Promise.all([
    supabase.from('products').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('store_id',storeId).eq('is_active', true),
    supabase.from('stock_levels').select('quantity,product:products(purchase_price,sale_price)').eq('company_id', companyId).eq('store_id',storeId).limit(1000),
  ]);
  if (productsResult.error) throw new Error(userErrorMessage(productsResult.error));
  if (stockResult.error) throw new Error(userErrorMessage(stockResult.error));
  const stock = (stockResult.data ?? []) as unknown as { quantity: number; product: { purchase_price: number; sale_price: number } | null }[];
  return stock.reduce((result, row) => {
    const quantity = Number(row.quantity);
    result.stockQuantity += quantity;
    result.purchaseValue += quantity * Number(row.product?.purchase_price ?? 0);
    result.expectedRevenue += quantity * Number(row.product?.sale_price ?? 0);
    return result;
  }, { products: productsResult.count ?? 0, stockQuantity: 0, purchaseValue: 0, expectedRevenue: 0 });
}
