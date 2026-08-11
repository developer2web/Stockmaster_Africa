import { describe,expect,it } from 'vitest';
import { registerSchema } from '../src/schemas/auth';
import { productSchema } from '../src/schemas/catalog';
import { stockMovementSchema } from '../src/schemas/inventory';

describe('validations critiques',()=>{
  it('refuse un mot de passe faible',()=>{expect(registerSchema.safeParse({fullName:'Mamadou',companyName:'Stock',storeName:'Centre',countryCode:'GN',email:'a@b.com',password:'password',confirmPassword:'password'}).success).toBe(false)});
  it('refuse un prix ou un seuil négatif',()=>{expect(productSchema.safeParse({name:'Produit',description:'',sku:'SKU-1',barcode:'',categoryId:null,supplierId:null,purchasePrice:'-1',salePrice:'2',lowStockThreshold:'-1',isActive:true}).success).toBe(false)});
  it('refuse une quantité de stock nulle ou négative',()=>{expect(stockMovementSchema.safeParse({storeId:'00000000-0000-4000-8000-000000000001',variantId:null,direction:'out',quantity:'0',note:''}).success).toBe(false)});
});
