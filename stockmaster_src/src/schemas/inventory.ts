import { z } from 'zod';

export const stockMovementSchema = z.object({
  storeId: z.string().uuid('Boutique requise'),
  variantId: z.string().uuid().nullable(),
  direction: z.enum(['in','out']),
  quantity: z.string().trim().refine((value) => Number.isFinite(Number(value)) && Number(value) > 0, 'Quantité supérieure à zéro requise'),
  note: z.string().trim().max(250, '250 caractères maximum').optional(),
});
export type StockMovementInput = z.infer<typeof stockMovementSchema>;
