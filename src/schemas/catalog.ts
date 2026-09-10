import { z } from 'zod';
import { parseDecimal } from '@/utils/number';

const optionalText = z.string().trim().max(250).optional();
export const supplierSchema=z.object({name:z.string().trim().min(2,'Nom requis').max(100),email:z.union([z.string().email('Email invalide'),z.literal('')]),phone:optionalText,address:optionalText,isActive:z.boolean()});
const nonNegative=z.string().trim().min(1,'Valeur requise').refine(v=>Number.isFinite(parseDecimal(v))&&parseDecimal(v)>=0,'Valeur invalide');
const optionalNumber=z.string().trim().refine(v=>v===''||(Number.isFinite(parseDecimal(v))&&parseDecimal(v)>=0),'Valeur invalide');
export const productSchema=z.object({name:z.string().trim().min(2,'Nom requis').max(120),description:z.string().trim().max(250).default(''),sku:z.string().trim().max(80).default('SKU-AUTO'),barcode:z.string().trim().max(80).default(''),supplierId:z.string().uuid().nullable(),unit:z.enum(['piece','carton','kg','litre','sac','paquet']),purchasePrice:nonNegative,salePrice:nonNegative,initialQuantity:nonNegative,lowStockThreshold:nonNegative,isActive:z.boolean()});
export const variantSchema=z.object({name:z.string().trim().min(1,'Nom requis'),sku:z.string().min(1).max(80),barcode:z.string().trim().optional(),purchasePrice:optionalNumber,salePrice:optionalNumber,isActive:z.boolean()});
export type SupplierInput=z.input<typeof supplierSchema>; export type ProductInput=z.input<typeof productSchema>; export type VariantInput=z.input<typeof variantSchema>;
