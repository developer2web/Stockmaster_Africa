import { supabase } from '@/services/supabase/client';
import { userErrorMessage } from '@/utils/errors';

export type AdminOverview = {
  products: number;
  stockQuantity: number;
  purchaseValue: number;
  expectedRevenue: number;
  lowStockProducts: number;
  customers: number;
  outstandingCredit: number;
};

export type DashboardTrends = {
  days: { date:string; revenue:number }[];
  topProducts: { name:string; quantity:number }[];
};

export async function getDashboardTrends(companyId:string,storeId:string):Promise<DashboardTrends>{
  const start=new Date();start.setHours(0,0,0,0);start.setDate(start.getDate()-6);
  const {data:sales,error}=await supabase.from('sales').select('id,total,created_at').eq('company_id',companyId).eq('store_id',storeId).gte('created_at',start.toISOString()).order('created_at');
  if(error)throw new Error(userErrorMessage(error));
  const days=Array.from({length:7},(_,index)=>{const date=new Date(start);date.setDate(start.getDate()+index);return{date:date.toISOString().slice(0,10),revenue:0}});
  const dayMap=new Map(days.map(day=>[day.date,day]));
  for(const sale of sales??[]){const day=dayMap.get(String(sale.created_at).slice(0,10));if(day)day.revenue+=Number(sale.total)}
  if(!(sales??[]).length)return{days,topProducts:[]};
  const {data:items,error:itemsError}=await supabase.from('sale_items').select('quantity,product:products(name)').in('sale_id',(sales??[]).map(sale=>sale.id));
  if(itemsError)throw new Error(userErrorMessage(itemsError));
  const totals=new Map<string,number>();
  for(const item of (items??[]) as unknown as {quantity:number;product:{name:string}|null}[]){const name=item.product?.name??'Produit';totals.set(name,(totals.get(name)??0)+Number(item.quantity))}
  const topProducts=[...totals].map(([name,quantity])=>({name,quantity})).sort((a,b)=>b.quantity-a.quantity).slice(0,5);
  return{days,topProducts};
}

export async function getAdminOverview(companyId: string, storeId: string): Promise<AdminOverview> {
  const { data, error } = await supabase.rpc('get_admin_overview', { p_company_id: companyId, p_store_id: storeId });
  if (error) throw new Error(userErrorMessage(error));
  const value = (data ?? {}) as Partial<AdminOverview>;
  return {
    products: Number(value.products ?? 0), stockQuantity: Number(value.stockQuantity ?? 0),
    purchaseValue: Number(value.purchaseValue ?? 0), expectedRevenue: Number(value.expectedRevenue ?? 0),
    lowStockProducts: Number(value.lowStockProducts ?? 0), customers: Number(value.customers ?? 0),
    outstandingCredit: Number(value.outstandingCredit ?? 0),
  };
}
