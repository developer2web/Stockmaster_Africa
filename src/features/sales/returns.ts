import { supabase } from '@/services/supabase/client';
import { createOperationId } from '@/utils/operationId';
import { userErrorMessage } from '@/utils/errors';

export type ReturnDisposition='restock'|'damaged'|'lost';
export type SaleReturn = { id:string;total:number;refund_method:string;note:string|null;debt_reduction:number;refunded_amount:number;created_at:string;sale_return_items:{sale_item_id:string;quantity:number;refund_amount:number;disposition:ReturnDisposition}[] };
export async function getSaleReturns(saleId:string):Promise<SaleReturn[]> {
  const {data,error}=await supabase.from('sale_returns').select('id,total,refund_method,note,debt_reduction,refunded_amount,created_at,sale_return_items(sale_item_id,quantity,refund_amount,disposition)').eq('sale_id',saleId).order('created_at',{ascending:false});
  if(error)throw new Error(userErrorMessage(error));return (data??[]) as unknown as SaleReturn[];
}
export async function recordSaleReturn(input:{saleId:string;items:{saleItemId:string;quantity:number;disposition:ReturnDisposition}[];refundMethod:string;note:string}) {
  if(!input.items.length||input.items.some(item=>!item.saleItemId||!(item.quantity>0)))throw new Error('Sélectionnez au moins une quantité à retourner.');
  const {data,error}=await supabase.rpc('record_sale_return',{p_sale_id:input.saleId,p_items:input.items,p_refund_method:input.refundMethod,p_note:input.note.trim()||null,p_operation_id:createOperationId()});
  if(error)throw new Error(userErrorMessage(error));return data as string;
}
