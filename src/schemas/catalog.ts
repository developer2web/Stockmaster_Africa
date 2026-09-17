import { z } from 'zod';
import { parseDecimal } from '@/utils/number';

const optionalText = z.string().trim().max(250).optional();
export const supplierSchema=z.object({name:z.string().trim().min(2,'Nom requis').max(100),email:z.union([z.string().email('Email invalide'),z.literal('')]),phone:optionalText,address:optionalText,isActive:z.boolean()});
// Les quantités et seuils de stock n'ont pas de fraction d'unité dans StockMaster.
const wholeNonNegative=z.string().trim().min(1,'Valeur requise').refine(v=>Number.isInteger(parseDecimal(v))&&parseDecimal(v)>=0,'Nombre entier requis');
// Le seul pays réellement pris en charge (voir constants/countries.ts) a le
// franc guinéen pour devise, qui n'a pas de sous-unité — un prix avec des
// centimes n'a pas de sens ici, et une virgule décimale mal interprétée par
// endroits (voir ProductFormScreen) produisait des marges absurdes.
const optionalWholeNonNegative=z.string().trim().refine(v=>v===''||(Number.isInteger(parseDecimal(v))&&parseDecimal(v)>=0),'Nombre entier requis');
const optionalWholeAboveOne=z.string().trim().refine(v=>v===''||(Number.isInteger(parseDecimal(v))&&parseDecimal(v)>1),'Nombre entier supérieur à 1');
export const productSchema=z.object({name:z.string().trim().min(2,'Nom requis').max(120),description:z.string().trim().max(250).default(''),sku:z.string().trim().max(80).default(''),barcode:z.string().trim().max(80).default(''),supplierId:z.string().uuid().nullable(),unit:z.enum(['piece','carton','kg','litre','sac','paquet']),purchasePrice:wholeNonNegative,salePrice:wholeNonNegative,initialQuantity:wholeNonNegative,lowStockThreshold:wholeNonNegative,isActive:z.boolean(),
  bulkEnabled:z.boolean().default(false),bulkUnitLabel:z.string().trim().max(40).default(''),bulkQuantity:optionalWholeAboveOne.default(''),bulkPrice:optionalWholeNonNegative.default(''),
  // Facultatif, jamais enregistré : sert uniquement à calculer le prix
  // d'achat à l'unité ci-dessus quand on connaît plutôt le prix du lot
  // payé au fournisseur (voir ProductFormScreen).
  bulkPurchasePrice:optionalWholeNonNegative.default('')
}).refine(v=>!v.bulkEnabled||(v.bulkUnitLabel.trim().length>0&&v.bulkQuantity!==''&&v.bulkPrice!==''&&parseDecimal(v.bulkPrice)>0),{message:'Renseignez le nom, la quantité (>1) et le prix du lot',path:['bulkUnitLabel']});
export const variantSchema=z.object({name:z.string().trim().min(1,'Nom requis'),sku:z.string().trim().max(80),barcode:z.string().trim().optional(),purchasePrice:optionalWholeNonNegative,salePrice:optionalWholeNonNegative,isActive:z.boolean()});
export type SupplierInput=z.input<typeof supplierSchema>; export type ProductInput=z.input<typeof productSchema>; export type VariantInput=z.input<typeof variantSchema>;
