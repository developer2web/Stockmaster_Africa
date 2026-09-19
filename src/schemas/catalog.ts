import { z } from 'zod';
import { wholeNumberError } from '@/utils/number';

const optionalText = z.string().trim().max(250).optional();
export const supplierSchema=z.object({name:z.string().trim().min(2,'Nom requis').max(100),email:z.union([z.string().email('Email invalide'),z.literal('')]),phone:optionalText,address:optionalText,isActive:z.boolean()});
// Les quantités, prix et seuils n'ont ni fraction ni signe dans StockMaster
// (pas de fraction d'unité, le franc guinéen n'a pas de sous-unité). Une saisie
// hors format est refusée avec un message — jamais corrigée en silence (voir
// wholeNumberError).
const requiredWhole=(empty:string,min=0,minMessage='')=>z.string().superRefine((raw,ctx)=>{
  const error=wholeNumberError(raw);
  if(error){ctx.addIssue({code:'custom',message:error==='Valeur requise'?empty:error});return}
  if(Number(raw.replace(/\s/g,''))<min)ctx.addIssue({code:'custom',message:minMessage});
});
const optionalWholeNonNegative=z.string().superRefine((raw,ctx)=>{
  if(raw.trim()==='')return;
  const error=wholeNumberError(raw);
  if(error)ctx.addIssue({code:'custom',message:error});
});
// Prix d'achat vide, prix de vente vide ou à zéro : refusés (voir requiredWhole).
// Le prix d'achat peut être 0 (produit reçu gratuitement), pas le prix de vente.
const tooLong=(label:string,max:number)=>`${label} ne doit pas dépasser ${max} caractères.`;
export const productSchema=z.object({
  name:z.string().trim().min(2,'Nom requis (2 caractères minimum)').max(120,tooLong('Le nom',120)),
  description:z.string().trim().max(250,tooLong('La description',250)).default(''),
  sku:z.string().trim().max(80,tooLong('La référence',80)).default(''),
  barcode:z.string().trim().max(80,tooLong('Le code-barres',80)).default(''),
  supplierId:z.string().uuid('Fournisseur invalide').nullable(),
  unit:z.enum(['piece','carton','kg','litre','sac','paquet'],'Unité invalide'),
  purchasePrice:requiredWhole('Prix d’achat requis (0 si aucun)'),
  salePrice:requiredWhole('Prix de vente requis',1,'Le prix de vente doit être supérieur à 0.'),
  initialQuantity:requiredWhole('Stock initial requis (0 si aucun)'),
  lowStockThreshold:requiredWhole('Seuil de stock faible requis'),
  isActive:z.boolean(),
  bulkEnabled:z.boolean().default(false),bulkUnitLabel:z.string().trim().max(40,tooLong('Le nom de l’unité de gros',40)).default(''),
  // Les 3 champs du lot ne sont contrôlés que si la vente en gros est activée
  // (voir superRefine) : une saisie restée dans un lot désactivé ne doit pas
  // bloquer l'enregistrement sans aucune erreur visible.
  bulkQuantity:z.string().default(''),bulkPrice:z.string().default(''),
  // Facultatif, jamais enregistré : sert uniquement à calculer le prix
  // d'achat à l'unité ci-dessus quand on connaît plutôt le prix du lot
  // payé au fournisseur (voir ProductFormScreen).
  bulkPurchasePrice:z.string().default('')
}).superRefine((v,ctx)=>{
  if(!v.bulkEnabled)return;
  const issue=(path:'bulkUnitLabel'|'bulkQuantity'|'bulkPrice'|'bulkPurchasePrice',message:string)=>ctx.addIssue({code:'custom',message,path:[path]});
  if(v.bulkUnitLabel.trim()==='')issue('bulkUnitLabel','Nom de l’unité de gros requis (ex : Carton)');
  const quantityError=wholeNumberError(v.bulkQuantity);
  if(quantityError)issue('bulkQuantity',quantityError==='Valeur requise'?'Quantité par lot requise':quantityError);
  else if(Number(v.bulkQuantity.replace(/\s/g,''))<=1)issue('bulkQuantity','La quantité par lot doit être supérieure à 1.');
  const priceError=wholeNumberError(v.bulkPrice);
  if(priceError)issue('bulkPrice',priceError==='Valeur requise'?'Prix de vente du lot requis':priceError);
  else if(Number(v.bulkPrice.replace(/\s/g,''))<=0)issue('bulkPrice','Le prix de vente du lot doit être supérieur à 0.');
  if(v.bulkPurchasePrice.trim()!==''){const error=wholeNumberError(v.bulkPurchasePrice);if(error)issue('bulkPurchasePrice',error)}
});
export const variantSchema=z.object({name:z.string().trim().min(1,'Nom de la variante requis').max(120,tooLong('Le nom',120)),sku:z.string().trim().max(80,tooLong('La référence',80)),barcode:z.string().trim().max(80,tooLong('Le code-barres',80)).optional(),purchasePrice:optionalWholeNonNegative,salePrice:optionalWholeNonNegative,isActive:z.boolean()});
export type SupplierInput=z.input<typeof supplierSchema>; export type ProductInput=z.input<typeof productSchema>; export type VariantInput=z.input<typeof variantSchema>;
