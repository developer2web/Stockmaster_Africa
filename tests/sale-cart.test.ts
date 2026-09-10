import { describe, expect, it } from 'vitest';
import { addCartItem, type CartLine } from '../src/stores/saleCartLogic';
import type { SaleStockItem } from '../src/types/database';

const nido:SaleStockItem={stockLevelId:'stock-1',productId:'nido',variantId:null,unit:'piece',name:'NIDO',sku:'NIDO-1',lookupCodes:['1234567890123'],salePrice:100,purchasePrice:70,available:3,imageUrl:null};

describe('panier alimenté par scanner',()=>{
  it('ajoute un produit scanné inconnu du panier',()=>{
    const items=addCartItem([],nido);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({productId:'nido',quantity:1});
  });

  it('incrémente le même produit à chaque nouveau scan sans dépasser le stock',()=>{
    let items:CartLine[]=[];
    items=addCartItem(items,nido);
    items=addCartItem(items,nido);
    items=addCartItem(items,nido);
    items=addCartItem(items,nido);
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(3);
  });
});
