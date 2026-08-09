export interface SaleCalculationItem { salePrice:number; purchasePrice:number; quantity:number; discount:number }
export const roundMoney=(value:number):number=>Math.round((value+Number.EPSILON)*100)/100;
export function calculateSaleTotals(items:SaleCalculationItem[]){
  const subtotal=roundMoney(items.reduce((sum,item)=>sum+item.salePrice*item.quantity,0));
  const discounts=roundMoney(items.reduce((sum,item)=>sum+item.discount,0));
  const cost=roundMoney(items.reduce((sum,item)=>sum+item.purchasePrice*item.quantity,0));
  return{subtotal,discounts,cost,total:roundMoney(subtotal-discounts),grossProfit:roundMoney(subtotal-cost-discounts)};
}
