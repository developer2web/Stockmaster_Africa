import { z } from 'zod';
export const expenseSchema=z.object({label:z.string().trim().min(2,'Indiquez le motif de la dépense.'),amount:z.string().trim().refine(value=>Number(value)>0,'Le montant doit être supérieur à zéro.'),expenseDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/,'Utilisez le format AAAA-MM-JJ.'),storeId:z.string().nullable()});
export type ExpenseInput=z.infer<typeof expenseSchema>;
