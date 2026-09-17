import { describe,expect,it } from 'vitest';
import { registerSchema } from '../src/schemas/auth';
import { productSchema } from '../src/schemas/catalog';
import { stockMovementSchema } from '../src/schemas/inventory';

describe('validations critiques',()=>{
  it('refuse un mot de passe faible',()=>{expect(registerSchema.safeParse({fullName:'Mamadou',companyName:'Stock',storeName:'Centre',countryCode:'GN',email:'a@b.com',password:'password',confirmPassword:'password'}).success).toBe(false)});
  it('accepte un produit sans SKU',()=>{expect(productSchema.safeParse({name:'Produit',description:'',barcode:'',supplierId:null,unit:'piece',purchasePrice:'10',salePrice:'20',initialQuantity:'5',lowStockThreshold:'2',isActive:true}).success).toBe(true)});
  it('refuse un prix ou un seuil négatif',()=>{expect(productSchema.safeParse({name:'Produit',description:'',sku:'SKU-1',barcode:'',supplierId:null,unit:'piece',purchasePrice:'-1',salePrice:'2',initialQuantity:'1',lowStockThreshold:'-1',isActive:true}).success).toBe(false)});
  // Audit externe (SM-08) : le franc guinéen n'a pas de centimes — un prix
  // avec une virgule décimale (habitude française, ex. "12,50") n'a pas de
  // sens ici et cassait le calcul de marge en direct sur la fiche produit.
  it('refuse un prix décimal, même écrit avec une virgule',()=>{
    expect(productSchema.safeParse({name:'Produit',description:'',sku:'',barcode:'',supplierId:null,unit:'piece',purchasePrice:'12,50',salePrice:'20',initialQuantity:'5',lowStockThreshold:'2',isActive:true}).success).toBe(false);
    expect(productSchema.safeParse({name:'Produit',description:'',sku:'',barcode:'',supplierId:null,unit:'piece',purchasePrice:'12.5',salePrice:'20',initialQuantity:'5',lowStockThreshold:'2',isActive:true}).success).toBe(false);
  });
  it('accepte un prix entier',()=>{expect(productSchema.safeParse({name:'Produit',description:'',sku:'',barcode:'',supplierId:null,unit:'piece',purchasePrice:'12',salePrice:'20',initialQuantity:'5',lowStockThreshold:'2',isActive:true}).success).toBe(true)});
  it('refuse une quantité de stock nulle ou négative',()=>{expect(stockMovementSchema.safeParse({storeId:'00000000-0000-4000-8000-000000000001',variantId:null,direction:'out',quantity:'0',note:''}).success).toBe(false)});
});
