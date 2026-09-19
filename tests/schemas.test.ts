import { describe,expect,it } from 'vitest';
import { registerSchema } from '../src/schemas/auth';
import { productSchema } from '../src/schemas/catalog';
import { customerSchema } from '../src/schemas/customers';
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
  describe('fiche produit : saisies refusées avec un message, jamais corrigées en silence',()=>{
    const base={name:'Produit',description:'',sku:'',barcode:'',supplierId:null,unit:'piece',purchasePrice:'10',salePrice:'20',initialQuantity:'5',lowStockThreshold:'2',isActive:true};
    const messages=(input:Record<string,unknown>)=>{const r=productSchema.safeParse({...base,...input});return r.success?[]:r.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`)};
    it('refuse prix d’achat, prix de vente ou stock vides',()=>{
      for(const field of ['purchasePrice','salePrice','initialQuantity'])expect(messages({[field]:''}).some(m=>m.startsWith(field))).toBe(true);
    });
    it('refuse un nom fait uniquement d’espaces',()=>{expect(messages({name:'     '}).some(m=>m.startsWith('name'))).toBe(true)});
    it('affiche un message français quand le nom dépasse 120 caractères',()=>{
      expect(messages({name:'a'.repeat(121)})).toEqual(['name: Le nom ne doit pas dépasser 120 caractères.']);
      expect(productSchema.safeParse({...base,name:'a'.repeat(120)}).success).toBe(true);
    });
    it('refuse -100, -2, 1e3 et 20.75 au lieu de les transformer',()=>{
      for(const value of ['-100','-2','1e3','20.75','20,75','abc'])expect(productSchema.safeParse({...base,purchasePrice:value}).success).toBe(false);
      expect(messages({initialQuantity:'-2'})).toEqual(['initialQuantity: La valeur ne peut pas être négative.']);
      expect(messages({purchasePrice:'20.75'})).toEqual(['purchasePrice: Saisissez un nombre entier, sans décimale.']);
    });
    it('exige un prix de vente supérieur à 0, accepte un prix d’achat et un stock à 0',()=>{
      expect(messages({salePrice:'0'})).toEqual(['salePrice: Le prix de vente doit être supérieur à 0.']);
      expect(productSchema.safeParse({...base,purchasePrice:'0',initialQuantity:'0'}).success).toBe(true);
    });
    it('exige les champs de la vente en gros seulement quand elle est activée',()=>{
      expect(productSchema.safeParse({...base,bulkEnabled:false,bulkQuantity:'-5',bulkPrice:'abc'}).success).toBe(true);
      const empty=messages({bulkEnabled:true});
      expect(empty.map(m=>m.split(':')[0]).sort()).toEqual(['bulkPrice','bulkQuantity','bulkUnitLabel']);
      expect(productSchema.safeParse({...base,bulkEnabled:true,bulkUnitLabel:'Carton',bulkQuantity:'24',bulkPrice:'400'}).success).toBe(true);
      expect(messages({bulkEnabled:true,bulkUnitLabel:'Carton',bulkQuantity:'1',bulkPrice:'400'})).toEqual(['bulkQuantity: La quantité par lot doit être supérieure à 1.']);
    });
  });
  it('refuse une quantité de stock nulle ou négative',()=>{expect(stockMovementSchema.safeParse({storeId:'00000000-0000-4000-8000-000000000001',variantId:null,direction:'out',quantity:'0',note:''}).success).toBe(false)});
  it('refuse une quantité de mouvement de stock invalide sans la corriger',()=>{
    const base={storeId:'00000000-0000-4000-8000-000000000001',variantId:null,direction:'in',note:'Correction'};
    for(const quantity of ['-2','1e3','2.5','','abc'])expect(stockMovementSchema.safeParse({...base,quantity}).success).toBe(false);
    expect(stockMovementSchema.safeParse({...base,quantity:'12'}).success).toBe(true);
  });
  // Audit externe (SM-14) : ce numéro sert de clé de recherche du client en
  // caisse et de contact Orange Money — "abc" y était accepté avant.
  it('refuse un téléphone client non numérique, mais accepte un numéro valide ou vide',()=>{
    const base={name:'Client',email:'',address:'',note:'',creditLimit:'',isActive:true};
    expect(customerSchema.safeParse({...base,phone:'abc'}).success).toBe(false);
    expect(customerSchema.safeParse({...base,phone:'622334455'}).success).toBe(true);
    expect(customerSchema.safeParse({...base,phone:'+224622334455'}).success).toBe(true);
    expect(customerSchema.safeParse({...base,phone:''}).success).toBe(true);
  });
});
