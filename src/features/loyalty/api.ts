import { supabase } from '@/services/supabase/client';
export type LoyaltySummary={points:number;lifetime_earned:number;customer_loyalty_transactions:{id:string;points:number;note:string|null;created_at:string}[]};
export async function getCustomerLoyalty(customerId:string):Promise<LoyaltySummary>{
  const[{data:account,error},{data:rows,error:rowsError}]=await Promise.all([supabase.from('customer_loyalty_accounts').select('points,lifetime_earned').eq('customer_id',customerId).maybeSingle(),supabase.from('customer_loyalty_transactions').select('id,points,note,created_at').eq('customer_id',customerId).order('created_at',{ascending:false}).limit(50)]);
  if(error)throw new Error(error.message);if(rowsError)throw new Error(rowsError.message);return {points:Number(account?.points??0),lifetime_earned:Number(account?.lifetime_earned??0),customer_loyalty_transactions:(rows??[]) as LoyaltySummary['customer_loyalty_transactions']};
}
