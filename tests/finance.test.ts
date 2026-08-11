import { describe,expect,it } from 'vitest';
import { calculateSaleTotals,roundMoney } from '../src/utils/finance';

describe('calculs financiers',()=>{
  it('soustrait la remise du chiffre d’affaires et du bénéfice',()=>{
    expect(calculateSaleTotals([{salePrice:12,purchasePrice:7,quantity:2,discount:1}])).toEqual({
      subtotal:24,discounts:1,cost:14,total:23,grossProfit:9,
    });
  });
  it('additionne plusieurs articles avec un arrondi monétaire stable',()=>{
    const result=calculateSaleTotals([
      {salePrice:10.1,purchasePrice:4.05,quantity:3,discount:0.3},
      {salePrice:2.25,purchasePrice:1,quantity:2,discount:0},
    ]);
    expect(result).toEqual({subtotal:34.8,discounts:0.3,cost:14.15,total:34.5,grossProfit:20.35});
    expect(roundMoney(0.1+0.2)).toBe(0.3);
  });
});
