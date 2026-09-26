import { addCalendarDays, businessDateValue, businessDayStart } from '@/utils/businessTime';
import { supabase } from '@/services/supabase/client';
import { userErrorMessage } from '@/utils/errors';
import { withOfflineCache } from '@/features/offline/storage';

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
  return withOfflineCache(`dashboard-trends:${companyId}:${storeId}`, async () => {
  // 7 derniers jours en heure de l'entreprise (même découpage que le serveur), pas de l'appareil.
  const startDate=addCalendarDays(businessDateValue(),-6);
  const start=businessDayStart(startDate);
  const {data,error}=await supabase.rpc('get_dashboard_trends_safe',{p_company_id:companyId,p_store_id:storeId,p_start:start.toISOString()});
  if(error)throw new Error(userErrorMessage(error));
  const value=(data??{}) as {sales?:{id:string;total:number;created_at:string}[];topProducts?:{name:string;quantity:number}[]};
  const sales=value.sales??[];
  const days=Array.from({length:7},(_,index)=>({date:addCalendarDays(startDate,index),revenue:0}));
  const dayMap=new Map(days.map(day=>[day.date,day]));
  for(const sale of sales??[]){const day=dayMap.get(businessDateValue(new Date(sale.created_at)));if(day)day.revenue+=Number(sale.total)}
  return{days,topProducts:(value.topProducts??[]).map(row=>({name:row.name,quantity:Number(row.quantity)}))};
  }, (value): value is DashboardTrends => !!value && typeof value === 'object' && 'days' in value && 'topProducts' in value);
}

export async function getAdminOverview(companyId: string, storeId: string): Promise<AdminOverview> {
  return withOfflineCache(`admin-overview:${companyId}:${storeId}`, async () => {
  const { data, error } = await supabase.rpc('get_admin_overview', { p_company_id: companyId, p_store_id: storeId });
  if (error) throw new Error(userErrorMessage(error));
  const value = (data ?? {}) as Partial<AdminOverview>;
  return {
    products: Number(value.products ?? 0), stockQuantity: Number(value.stockQuantity ?? 0),
    purchaseValue: Number(value.purchaseValue ?? 0), expectedRevenue: Number(value.expectedRevenue ?? 0),
    lowStockProducts: Number(value.lowStockProducts ?? 0), customers: Number(value.customers ?? 0),
    outstandingCredit: Number(value.outstandingCredit ?? 0),
  };
  }, (value): value is AdminOverview => !!value && typeof value === 'object' && 'products' in value && 'outstandingCredit' in value);
}
