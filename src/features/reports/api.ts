import { fetchAllRows } from '@/services/supabase/pagination';
import { supabase } from '@/services/supabase/client';
import type { BusinessReport, ReportFilters, ReportMetricRow } from '@/types/database';

export interface ReportQuery { startDate:string; endDate:string; storeId:string|null; employeeId:string|null; productId:string|null }
const number=(value:unknown)=>Number(value??0);
const object=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'?value as Record<string,unknown>:{};
// Chaque classement (produits/paiements/boutiques/employés) ne renvoie côté
// serveur qu'un sous-ensemble de ces champs (ex. quantity n'existe que pour
// les produits) — ReportMetricRow les déclare tous optionnels exprès, et
// l'écran ne montre la ligne de détail (quantité + CA) que si la valeur est
// présente. Mettre 0 par défaut ici cassait ce contrat : un champ jamais
// renvoyé par le serveur devenait 0 au lieu de rester absent, et affichait
// « 0 unité » sous des boutiques/employés/moyens de paiement qui n'ont
// pourtant aucune quantité à montrer.
const numeric=(row:Record<string,unknown>,key:string):number|undefined=>key in row?Number((row[key] as number|null|undefined)??0):undefined;
const rows=(value:unknown):ReportMetricRow[]=>Array.isArray(value)?value.map((item)=>{const row=object(item);return{id:typeof row.id==='string'?row.id:undefined,name:typeof row.name==='string'?row.name:'',revenue:numeric(row,'revenue'),gross_profit:numeric(row,'gross_profit'),quantity:numeric(row,'quantity'),amount:numeric(row,'amount'),count:numeric(row,'count'),sales:numeric(row,'sales')}}):[];
export async function getReportFilters(storeId:string|null,companyId?:string):Promise<ReportFilters>{const{data,error}=await supabase.rpc('get_report_filters',{p_store_id:storeId,p_company_id:storeId?null:companyId??null});if(error)throw new Error(error.message);const value=(data??{})as Partial<ReportFilters>;return{stores:value.stores??[],employees:value.employees??[],products:value.products??[]}}
export async function getBusinessReport(query:ReportQuery):Promise<BusinessReport>{const{data,error}=await supabase.rpc('get_business_report',{p_start_date:query.startDate,p_end_date:query.endDate,p_store_id:query.storeId,p_employee_id:query.employeeId,p_product_id:query.productId,p_category_id:null});if(error)throw new Error(error.message);const value=object(data);const previous=object(value.previous);return{startDate:typeof value.startDate==='string'?value.startDate:query.startDate,endDate:typeof value.endDate==='string'?value.endDate:query.endDate,revenue:number(value.revenue),costOfGoods:number(value.costOfGoods),grossProfit:number(value.grossProfit),expenses:number(value.expenses),netProfit:number(value.netProfit),quantitySold:number(value.quantitySold),saleCount:number(value.saleCount),stockValue:number(value.stockValue),previous:{revenue:number(previous.revenue),grossProfit:number(previous.grossProfit),expenses:number(previous.expenses),netProfit:number(previous.netProfit)},topProducts:rows(value.topProducts),paymentMethods:rows(value.paymentMethods),stores:rows(value.stores),employees:rows(value.employees)}}
export async function getCashBalance(companyId: string, storeId: string | null = null): Promise<number> {
  const transactions = await fetchAllRows((from, to) => {
    let query = supabase.from('cash_transactions').select('transaction_type,amount').eq('company_id', companyId);
    if (storeId) query = query.eq('store_id', storeId);
    return query.order('id').range(from, to);
  });
  return transactions.reduce((sum, row) => sum + (row.transaction_type === 'deposit' ? number(row.amount) : -number(row.amount)), 0);
}
export async function getLifetimeNetProfit(storeId:string):Promise<number>{const{data,error}=await supabase.rpc('get_lifetime_net_profit',{p_store_id:storeId});if(error)throw new Error(error.message);return number(data)}

export type FinancialDetails={
  sales:{reference:string|null;created_at:string;total:number;gross_profit:number;payment_method:string|null;store:{name:string}|null}[];
  expenses:{label:string;expense_date:string;amount:number;store:{name:string}|null}[];
  cash:{designation:string;created_at:string;transaction_type:'deposit'|'withdrawal';amount:number;source:string;store:{name:string}|null}[];
};
export async function getFinancialDetails(companyId:string,startDate:string,endDate:string,storeId:string|null):Promise<FinancialDetails>{
  const end=`${endDate}T23:59:59.999Z`;
  const sales=supabase.rpc('get_financial_sales_safe',{p_company_id:companyId,p_start:`${startDate}T00:00:00.000Z`,p_end:end,p_store_id:storeId});
  let expenses=supabase.from('expenses').select('label,expense_date,amount,store:stores(name)').eq('company_id',companyId).gte('expense_date',startDate).lte('expense_date',endDate).order('expense_date',{ascending:false}).order('id');
  let cash=supabase.from('cash_transactions').select('designation,created_at,transaction_type,amount,source,store:stores(name)').eq('company_id',companyId).gte('created_at',`${startDate}T00:00:00.000Z`).lte('created_at',end).order('created_at',{ascending:false}).order('id');
  if(storeId){expenses=expenses.eq('store_id',storeId);cash=cash.eq('store_id',storeId)}
  const[salesResult,expensesResult,cashResult]=await Promise.all([sales,fetchAllRows((from, to) => expenses.range(from, to)),fetchAllRows((from, to) => cash.range(from, to))]);
  if(salesResult.error)throw new Error(salesResult.error.message);
  const salesRows=(Array.isArray(salesResult.data)?salesResult.data:[])as unknown as ({id:string}&FinancialDetails['sales'][number])[];
  if(salesRows.length){
    const fin: { sale_id: string; gross_profit: number }[] = [];
    // Bound URL size and paginate each batch if the server lowers its row cap.
    for (let start = 0; start < salesRows.length; start += 100) {
      const ids = salesRows.slice(start, start + 100).map((row) => row.id);
      fin.push(...await fetchAllRows((from, to) => supabase.from('sale_financials')
        .select('sale_id,gross_profit').in('sale_id', ids).order('sale_id').range(from, to)));
    }
    const map=new Map((fin??[]).map((row)=>[(row as{sale_id:string}).sale_id,Number((row as{gross_profit:number}).gross_profit)]));
    for(const row of salesRows)row.gross_profit=map.get(row.id)??0;
  }
  return{sales:salesRows as unknown as FinancialDetails['sales'],expenses:expensesResult as unknown as FinancialDetails['expenses'],cash:cashResult as unknown as FinancialDetails['cash']};
}
