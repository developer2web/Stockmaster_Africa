import { z } from 'zod';
import { parseDecimal } from '@/utils/number';

export const stockMovementSchema = z.object({
  storeId: z.string().uuid('Boutique requise'),
  variantId: z.string().uuid().nullable(),
  direction: z.enum(['in','out']),
  quantity: z.string().trim().refine((value) => Number.isFinite(parseDecimal(value)) && parseDecimal(value) > 0, 'Quantité supérieure à zéro requise'),
  note: z.string().trim().min(3, 'Le motif de la correction est obligatoire').max(250, '250 caractères maximum'),
});
export type StockMovementInput = z.infer<typeof stockMovementSchema>;
