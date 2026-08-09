import { z } from 'zod';
import { parseDecimal } from '@/utils/number';

const optionalText = z.string().trim().max(250).optional();
export const categorySchema=z.object({name:z.string().trim().min(2,'Nom requis').max(80),description:optionalText,isActive:z.boolean()});
export const supplierSchema=z.object({name:z.string().trim().min(2,'Nom requis').max(100),email:z.union([z.string().email('Email invalide'),z.literal('')]),phone:optionalText,address:optionalText,isActive:z.boolean()});
const nonNegative=z.string().trim().min(1,'Valeur requise').refine(v=>Number.isFinite(parseDecimal(v))&&parseDecimal(v)>=0,'Valeur invalide');
const optionalNumber=z.string().trim().refine(v=>v===''||(Number.isFinite(parseDecimal(v))&&parseDecimal(v)>=0),'Valeur invalide');
export const productSchema=z.object({name:z.string().trim().min(2,'Nom requis').max(120),description:optionalText,sku:z.string().trim().min(2,'SKU requis').max(80),barcode:z.string().trim().max(80).optional(),categoryId:z.string().uuid().nullable(),supplierId:z.string().uuid().nullable(),purchasePrice:nonNegative,salePrice:nonNegative,lowStockThreshold:nonNegative,isActive:z.boolean()});
export const variantSchema=z.object({name:z.string().trim().min(1,'Nom requis'),sku:z.string().trim().min(2,'SKU requis'),barcode:z.string().trim().optional(),purchasePrice:optionalNumber,salePrice:optionalNumber,isActive:z.boolean()});
export type CategoryInput=z.infer<typeof categorySchema>; export type SupplierInput=z.infer<typeof supplierSchema>; export type ProductInput=z.infer<typeof productSchema>; export type VariantInput=z.infer<typeof variantSchema>;
