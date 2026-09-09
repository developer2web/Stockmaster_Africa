import { parseCalendarDate } from '@/utils/calendar';
import { z } from 'zod';
import { parseDecimal } from '@/utils/number';
export const expenseSchema=z.object({label:z.string().trim().min(2,'Indiquez le motif de la dépense.'),amount:z.string().trim().refine(value=>parseDecimal(value)>0,'Le montant doit être supérieur à zéro.'),expenseDate:z.string().refine(value => !!parseCalendarDate(value), 'Choisissez une date valide dans le calendrier.'),storeId:z.string().nullable()});
export type ExpenseInput=z.infer<typeof expenseSchema>;
