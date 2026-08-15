import { supabase } from '@/services/supabase/client';
import { createOperationId } from '@/utils/operationId';

export type OrderItem = { id:string; product_id:string; product_variant_id:string|null; quantity:number; delivered_quantity:number; unit_price:number; product:{name:string;sku:string}|null; variant:{name:string}|null };
export type CustomerOrder = { id:string; reference:string; status:'confirmed'|'partial'|'fulfilled'|'cancelled'; total:number; deposit_amount:number; deposit_remaining:number; note:string|null; created_at:string; customer:{name:string;phone:string|null}|null; customer_order_items:OrderItem[] };
const fail=(error:{message:string}|null)=>{if(error)throw new Error(error.message)};

export async function getCustomerOrders(companyId:string,storeId:string){
  const {data,error}=await supabase.from('customer_orders').select('id,reference,status,total,deposit_amount,deposit_remaining,note,created_at,customer:customers(name,phone),customer_order_items(id,product_id,product_variant_id,quantity,delivered_quantity,unit_price,product:products(name,sku),variant:product_variants(name))').eq('company_id',companyId).eq('store_id',storeId).order('created_at',{ascending:false}).limit(200);
  fail(error);return (data??[]) as unknown as CustomerOrder[];
}
export async function createCustomerOrder(storeId:string,customerId:string,items:{productId:string;variantId:string|null;quantity:number}[],deposit:number,note:string){
  const {data,error}=await supabase.rpc('create_customer_order',{p_store_id:storeId,p_customer_id:customerId,p_items:items,p_deposit:deposit,p_note:note||null,p_operation_id:createOperationId()});fail(error);return data as string;
}
export async function deliverCustomerOrder(orderId:string,items:{orderItemId:string;quantity:number}[],method:string,paidNow:number){
  const {data,error}=await supabase.rpc('deliver_customer_order',{p_order_id:orderId,p_items:items,p_payment_method:method,p_amount_paid_now:paidNow,p_operation_id:createOperationId()});fail(error);return data as string;
}
export async function cancelCustomerOrder(orderId:string,refund=true){
  const {error}=await supabase.rpc('cancel_customer_order',{p_order_id:orderId,p_refund_deposit:refund,p_operation_id:createOperationId()});fail(error);
}
