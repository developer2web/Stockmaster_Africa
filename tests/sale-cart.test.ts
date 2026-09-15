import { describe, expect, it } from 'vitest';
import { addCartItem, type CartLine } from '../src/stores/saleCartLogic';
import type { SaleStockItem } from '../src/types/database';

const nido:SaleStockItem={stockLevelId:'stock-1',productId:'nido',variantId:null,unit:'piece',name:'NIDO',sku:'NIDO-1',lookupCodes:['1234567890123'],salePrice:100,purchasePrice:70,available:3,imageUrl:null,bulkUnitLabel:null,bulkQuantity:null,bulkPrice:null};

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

describe('vente en gros et au détail sur le même produit',()=>{
  const lait:SaleStockItem={stockLevelId:'stock-2',productId:'lait',variantId:null,unit:'carton',name:'Lait en poudre',sku:'LAIT-1',lookupCodes:[],salePrice:4000,purchasePrice:2800,available:50,imageUrl:null,bulkUnitLabel:'Carton',bulkQuantity:24,bulkPrice:90000};

  it('ajouter un carton crée une ligne de bulkQuantity unités, prix ramené à l’unité de base',()=>{
    const items=addCartItem([],lait,false,'bulk');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({saleMode:'bulk',quantity:24,salePrice:90000/24});
  });

  it('gros et détail du même produit forment deux lignes distinctes, sans se marcher dessus',()=>{
    let items=addCartItem([],lait,false,'bulk');
    items=addCartItem(items,lait,false,'unit');
    expect(items).toHaveLength(2);
    expect(items.find(i=>i.saleMode==='bulk')?.quantity).toBe(24);
    expect(items.find(i=>i.saleMode==='unit')?.quantity).toBe(1);
  });

  it('un second carton s’ajoute par pas de 24, pas 1 par 1',()=>{
    let items=addCartItem([],lait,false,'bulk');
    items=addCartItem(items,lait,false,'bulk');
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(48);
  });

  it('les deux modes puisent dans le même stock : refuse un carton si ça dépasserait le disponible réel',()=>{
    // 50 disponibles, 30 déjà réservés au détail : il ne reste que 20, pas assez pour 1 carton de 24.
    let items=addCartItem([],lait,false,'unit');
    items=addCartItem(items,{...lait,available:50},false,'unit'); // 2
    for(let i=0;i<28;i++) items=addCartItem(items,{...lait,available:50},false,'unit'); // 30 au détail
    const before=items;
    items=addCartItem(items,lait,false,'bulk');
    expect(items).toBe(before); // refusé, rien n’a changé
  });
});
